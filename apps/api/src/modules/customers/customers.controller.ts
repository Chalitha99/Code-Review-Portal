import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CustomersService } from './customers.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ReasonDto } from '../../common/dto/reason.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

@ApiTags('Customers')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}
  @Get() @ApiOkResponse() findAll() {
    return this.customers.findAll();
  }
  @Get(':id/next-task-id') @ApiOkResponse() nextTaskId(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.nextTaskId(id);
  }
  @Get(':id') @ApiOkResponse() findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customers.findOne(id);
  }
  @Post() @Roles('ADMIN') @ApiCreatedResponse() create(
    @Body() dto: CreateCustomerDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.customers.create(dto, admin);
  }
  @Patch(':id') @Roles('ADMIN') @ApiOkResponse() update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.customers.update(id, dto, admin);
  }
  /** Permanent delete is a Super Admin power (`records.purge`); Admins deactivate. */
  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReasonDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    await this.customers.remove(id, admin, dto.reason);
  }
}
