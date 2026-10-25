import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfirmationService } from '../ai/confirmation.service';
import { clashes, GoogleCalendarService } from '../google/google-calendar.service';
import { BookSlotDto, CreateSlotDto } from './slots.dto';
import { Slot } from './slot.entity';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const toHHmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** What the public sees: no personal data about who booked. */
export interface PublicSlot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isBooked: boolean;
  /** Clashes with an event in the host's connected Google Calendar */
  isUnavailable: boolean;
}

const toPublic = (s: Slot, isUnavailable = false): PublicSlot => ({
  id: s.id,
  date: s.date,
  startTime: s.startTime,
  endTime: toHHmm(toMinutes(s.startTime) + s.durationMinutes),
  durationMinutes: s.durationMinutes,
  isBooked: s.bookedAt !== null,
  isUnavailable,
});

@Injectable()
export class SlotsService {
  constructor(
    @InjectRepository(Slot) private readonly repo: Repository<Slot>,
    private readonly confirmation: ConfirmationService,
    private readonly calendar: GoogleCalendarService,
  ) {}

  async list(): Promise<PublicSlot[]> {
    const slots = await this.repo.find({ order: { date: 'ASC', startTime: 'ASC' } });
    const busy = await this.calendar.windowsFor(slots); // null when no calendar is connected
    return slots.map((s) => toPublic(s, !s.bookedAt && clashes(busy, s)));
  }

  async create(dto: CreateSlotDto): Promise<PublicSlot> {
    // Reject impossible dates like 2026-02-31
    const parsed = new Date(`${dto.date}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dto.date) {
      throw new BadRequestException('Invalid date');
    }

    const start = toMinutes(dto.startTime);
    const end = start + dto.durationMinutes;
    if (end > 24 * 60) {
      throw new BadRequestException('A slot cannot run past midnight');
    }

    // Don't let the host publish overlapping slots
    const sameDay = await this.repo.find({ where: { date: dto.date } });
    const clash = sameDay.find((s) => {
      const s0 = toMinutes(s.startTime);
      return start < s0 + s.durationMinutes && s0 < end;
    });
    if (clash) {
      throw new ConflictException(`Overlaps an existing slot (${clash.startTime}, ${clash.durationMinutes} min)`);
    }

    const saved = await this.repo.save(this.repo.create({ ...dto }));
    return toPublic(saved);
  }

  async remove(id: string): Promise<void> {
    const res = await this.repo
      .createQueryBuilder()
      .delete()
      .from(Slot)
      .where('id = :id AND "bookedAt" IS NULL', { id })
      .execute();
    if (res.affected === 0) {
      const exists = await this.repo.exists({ where: { id } });
      if (!exists) throw new NotFoundException('Slot not found');
      throw new ConflictException('Booked slots cannot be removed');
    }
  }

  /**
   * Double-booking protection: a single atomic UPDATE that only succeeds
   * while "bookedAt" IS NULL. If two people book at the same moment,
   * Postgres serialises the row update and exactly one gets affected = 1.
   */
  async book(id: string, dto: BookSlotDto): Promise<{ slot: PublicSlot; confirmationMessage: string; calendarInviteSent: boolean }> {
    // Re-check the calendar right now (bypassing the cache): an event may have been added
    // after the list the visitor is looking at was loaded.
    const slotRow = await this.repo.findOneBy({ id });
    if (!slotRow) throw new NotFoundException('Slot not found');
    if (clashes(await this.calendar.windowsFor([slotRow], true), slotRow)) {
      throw new ConflictException('Sorry, that time is no longer available');
    }

    const res = await this.repo
      .createQueryBuilder()
      .update(Slot)
      .set({ bookedByName: dto.name, bookedByEmail: dto.email, bookedAt: () => 'NOW()' })
      .where('id = :id AND "bookedAt" IS NULL', { id })
      .execute();

    if (res.affected === 0) {
      const exists = await this.repo.exists({ where: { id } });
      if (!exists) throw new NotFoundException('Slot not found');
      throw new ConflictException('Sorry, this slot was just booked by someone else');
    }

    const slot = await this.repo.findOneByOrFail({ id });
    const pub = toPublic(slot);
    const [confirmationMessage, calendarInviteSent] = await Promise.all([
      this.confirmation.generate({ name: dto.name, date: pub.date, startTime: pub.startTime, endTime: pub.endTime }),
      this.calendar.createEvent({
        name: dto.name,
        email: dto.email,
        date: pub.date,
        startTime: pub.startTime,
        endTime: pub.endTime,
      }),
    ]);
    return { slot: pub, confirmationMessage, calendarInviteSent };
  }
}
