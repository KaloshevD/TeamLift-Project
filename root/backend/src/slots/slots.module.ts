import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleModule } from '../google/google.module';
import { ConfirmationService } from '../ai/confirmation.service';
import { Slot } from './slot.entity';
import { SlotsController } from './slots.controller';
import { SlotsService } from './slots.service';

@Module({
  imports: [TypeOrmModule.forFeature([Slot]), GoogleModule],
  controllers: [SlotsController],
  providers: [SlotsService, ConfirmationService],
})
export class SlotsModule {}
