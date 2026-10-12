import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { ReviewsService } from './reviews.service.js';

@ApiTags('Reviews')
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get('reviews')
  @ApiOkResponse()
  findAll(@Query('scope') scope: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.reviews.findAll(scope ?? 'all', user);
  }

  @Get('general-check')
  @ApiOkResponse()
  findGeneralCheck() {
    return this.reviews.findGeneralCheck();
  }

  @Get('tasks/:taskId/review')
  @ApiOkResponse()
  @ApiNoContentResponse()
  async findCurrent(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const review = await this.reviews.findCurrent(taskId, user);
    if (review === null) response.status(HttpStatus.NO_CONTENT);
    return review ?? undefined;
  }

  @Get('tasks/:taskId/reviews')
  @ApiOkResponse()
  findHistory(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.findHistory(taskId, user);
  }

  @Put('tasks/:taskId/review')
  @ApiOkResponse()
  saveDraft(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: unknown,
    @Query('source') source: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.saveDraft(taskId, body, user, source === 'manual');
  }

  // An action on an existing resource, not a creation: 200, not 201.
  @HttpCode(HttpStatus.OK)
  @Post('tasks/:taskId/review')
  @ApiOkResponse()
  decide(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.decide(taskId, body, user);
  }

  @Get('tasks/:taskId/responses')
  @ApiOkResponse()
  findResponses(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.findResponses(taskId, user);
  }

  // An action on an existing resource, not a creation: 200, not 201.
  @HttpCode(HttpStatus.OK)
  @Post('tasks/:taskId/responses')
  @ApiOkResponse()
  saveResponse(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.saveResponse(taskId, body, user);
  }

  @Delete('tasks/:taskId/responses/:responseId')
  @ApiOkResponse()
  removeResponse(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.removeResponse(taskId, responseId, user);
  }

  @Patch('tasks/:taskId/responses/:responseId/verdict')
  @ApiOkResponse()
  updateVerdict(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Param('responseId', ParseUUIDPipe) responseId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.updateVerdict(taskId, responseId, body, user);
  }
}
