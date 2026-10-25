import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Single-host app: one row (id = 'host') holding the connected calendar's refresh token. */
@Entity('google_auth')
export class GoogleAuth {
  @PrimaryColumn({ type: 'varchar', length: 20 })
  id: string;

  @Column({ type: 'text' })
  refreshToken: string;

  /** Space-separated scopes Google granted, so we know if we may create events */
  @Column({ type: 'text', nullable: true })
  scope: string | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  connectedAt: Date;
}
