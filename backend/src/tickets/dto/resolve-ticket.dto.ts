import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ResolveTicketDto {
  @IsString()
  @IsNotEmpty()
  managerId: string;

  @IsString()
  @IsNotEmpty()
  managerName: string;

  @IsOptional()
  @IsString()
  @IsIn(['manager', 'supplier'])
  resolverRole?: string;
}
