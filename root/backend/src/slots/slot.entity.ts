import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('slots')
@Index(['date', 'startTime'])
export class Slot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** YYYY-MM-DD (single time zone assumed) */
  @Column({ type: 'date' })
  date: string;

  /** HH:mm, 24h */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  @Column({ type: 'int' })
  durationMinutes: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bookedByName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  bookedByEmail: string | null;

  /** null = still available */
  @Column({ type: 'timestamptz', nullable: true })
  bookedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
