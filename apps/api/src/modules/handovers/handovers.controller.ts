import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  HttpCode,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CreateHandoverDto } from './dto/create-handover.dto.js';
import { ReassignHandoverDto } from './dto/reassign-handover.dto.js';
import { HandoversService } from './handovers.service.js';
import { ReviewTasksService } from '../review-tasks/review-tasks.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';

@ApiTags('Handovers')
@Controller('tasks/:taskId/handover')
export class ReviewerHandoversController {
  constructor(
    private readonly tasks: ReviewTasksService,
    private readonly reviews: ReviewsService,
  ) {}

  @Post()
  @Roles('REVIEWER')
  @ApiCreatedResponse()
  async create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: CreateHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    const { draft } = dto;
    return this.tasks.handover(
      taskId,
      dto,
      actor,
      draft === undefined
        ? undefined
        : (tx) => this.reviews.saveHandoverDraft(tx, taskId, draft, actor),
    );
  }
}

@ApiTags('Handovers')
@Controller('handovers')
@Roles('ADMIN')
export class AdminHandoversController {
  constructor(private readonly handovers: HandoversService) {}

  @Get()
  @ApiOkResponse()
  findAll() {
    return this.handovers.findAll();
  }

  @Get(':handoverId')
  @ApiOkResponse()
  findOne(@Param('handoverId', ParseUUIDPipe) handoverId: string) {
    return this.handovers.findOne(handoverId);
  }

  /** 204 when the reviewer left no draft — an empty 200 body would not parse. */
  @Get(':handoverId/draft')
  @ApiOkResponse()
  @ApiNoContentResponse()
  async findDraft(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const draft = await this.handovers.findDraft(handoverId);
    if (draft === null) response.status(HttpStatus.NO_CONTENT);
    return draft ?? undefined;
  }

  // An action on an existing resource, not a creation: 200, not 201.
  @HttpCode(HttpStatus.OK)
  @Post(':handoverId/reassign')
  @ApiOkResponse()
  reassign(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @Body() dto: ReassignHandoverDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.handovers.reassign(handoverId, dto, actor);
  }

  // An action on an existing resource, not a creation: 200, not 201.
  @HttpCode(HttpStatus.OK)
  @Post(':handoverId/return')
  @ApiOkResponse()
  returnToQueue(
    @Param('handoverId', ParseUUIDPipe) handoverId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.handovers.returnToQueue(handoverId, actor);
  }
}
