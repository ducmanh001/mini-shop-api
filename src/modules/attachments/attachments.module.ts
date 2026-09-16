import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '../products/entities/product.entity';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { Attachment } from './entities/attachment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Attachment, Product])],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [TypeOrmModule, AttachmentsService],
})
export class AttachmentsModule {}
