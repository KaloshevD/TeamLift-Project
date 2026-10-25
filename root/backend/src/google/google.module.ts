import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleAuth } from './google-auth.entity';
import { GoogleCalendarService } from './google-calendar.service';
import { GoogleController } from './google.controller';

@Module({
  imports: [TypeOrmModule.forFeature([GoogleAuth])],
  controllers: [GoogleController],
  providers: [GoogleCalendarService],
  exports: [GoogleCalendarService],
})
export class GoogleModule {}
