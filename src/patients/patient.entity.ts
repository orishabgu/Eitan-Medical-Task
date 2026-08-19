import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('patients')
export class Patient {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'int', nullable: true })
  age!: number | null;

  @Column({ type: 'text', nullable: true })
  gender!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
