import { IsIn, IsString } from 'class-validator';

export const updatableSupplierRequestStatuses = [
  'pending',
  'in_progress',
  'answered',
  'closed',
  'cancelled',
] as const;

export class UpdateSupplierRequestStatusDto {
  @IsString()
  @IsIn(updatableSupplierRequestStatuses)
  status: (typeof updatableSupplierRequestStatuses)[number];
}
