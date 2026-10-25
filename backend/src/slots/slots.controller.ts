import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { BookSlotDto, CreateSlotDto } from './slots.dto';
import { SlotsService } from './slots.service';

@Controller('slots')
export class SlotsController {
  constructor(private readonly slots: SlotsService) {}

  @Get()
  list() {
    return this.slots.list();
  }

  @Post()
  create(@Body() dto: CreateSlotDto) {
    return this.slots.create(dto);
  }

  @Post(':id/book')
  @HttpCode(200)
  book(@Param('id', ParseUUIDPipe) id: string, @Body() dto: BookSlotDto) {
    return this.slots.book(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.slots.remove(id);
  }
}
