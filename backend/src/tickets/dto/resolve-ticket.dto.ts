import { IsNotEmpty, IsString } from 'class-validator';

export class ResolveTicketDto {
  @IsString()
  @IsNotEmpty()
  managerId: string;

  @IsString()
  @IsNotEmpty()
  managerName: string;
}
