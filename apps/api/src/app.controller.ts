import { Controller, Get } from '@nestjs/common';
import {
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Public } from './modules/auth/decorators/public.decorator.js';

@ApiTags('Application')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get the API welcome message',
    description:
      'Public endpoint that confirms the Code Review Portal API is reachable.',
  })
  @ApiProduces('text/plain')
  @ApiOkResponse({
    description: 'The API is running.',
    content: {
      'text/plain': {
        schema: { type: 'string', example: 'Hello World!' },
      },
    },
  })
  @ApiInternalServerErrorResponse({
    description: 'An unexpected server error occurred.',
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
