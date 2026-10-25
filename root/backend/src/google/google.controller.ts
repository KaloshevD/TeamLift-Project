import { BadRequestException, Controller, Delete, Get, HttpCode, Logger, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('google')
export class GoogleController {
  private readonly log = new Logger(GoogleController.name);
  constructor(private readonly google: GoogleCalendarService) {}

  @Get('status')
  async status() {
    return {
      configured: this.google.configured,
      connected: await this.google.isConnected(),
      canCreateEvents: await this.google.canCreateEvents(),
    };
  }

  /** Browser navigates here; we bounce it to Google's consent screen. */
  @Get('connect')
  connect(@Res() res: Response) {
    if (!this.google.configured) throw new BadRequestException('Google Calendar is not configured');
    res.redirect(this.google.authUrl());
  }

  /** Google redirects back here with ?code=...&state=... */
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ) {
    const front = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    try {
      if (error || !code) throw new Error(error ?? 'missing code');
      await this.google.handleCallback(code, state);
      res.redirect(`${front}/#/host?calendar=connected`);
    } catch (err) {
      this.log.warn(`Google connect failed: ${(err as Error).message}`);
      res.redirect(`${front}/#/host?calendar=error`);
    }
  }

  @Delete()
  @HttpCode(204)
  async disconnect() {
    await this.google.disconnect();
  }
}
