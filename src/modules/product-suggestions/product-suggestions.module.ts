import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { AdminProductSuggestionsController } from './admin-product-suggestions.controller';
import { ProductSuggestion } from './entities/product-suggestion.entity';
import { ProductSuggestionsController } from './product-suggestions.controller';
import { ProductSuggestionsService } from './product-suggestions.service';

@Module({
  imports: [TypeOrmModule.forFeature([ProductSuggestion]), UsersModule],
  controllers: [
    ProductSuggestionsController,
    AdminProductSuggestionsController,
  ],
  providers: [ProductSuggestionsService],
  exports: [TypeOrmModule],
})
export class ProductSuggestionsModule {}
