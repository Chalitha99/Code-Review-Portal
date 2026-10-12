import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CreateRoleDto } from './dto/create-role.dto.js';
import { UpdateRoleDto } from './dto/update-role.dto.js';
import { RolesService } from './roles.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

@ApiTags('Roles')
@Controller('roles')
@Roles('ADMIN', 'SUPER_ADMIN')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOkResponse()
  findAll() {
    return this.roles.findAll();
  }

  @Get(':id')
  @ApiOkResponse()
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roles.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiCreatedResponse()
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  @ApiOkResponse()
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roles.remove(id);
  }
}
