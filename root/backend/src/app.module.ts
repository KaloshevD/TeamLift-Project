import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleAuth } from './google/google-auth.entity';
import { GoogleModule } from './google/google.module';
import { Slot } from './slots/slot.entity';
import { SlotsModule } from './slots/slots.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/slots',
      entities: [Slot, GoogleAuth],
      // Fine for a small demo; use migrations in a real app.
      synchronize: true,
    }),
    GoogleModule,
    SlotsModule,
  ],
})
export class AppModule {}
