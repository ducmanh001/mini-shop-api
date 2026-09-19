import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { I18nService } from 'nestjs-i18n';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { escapeIlikePattern } from '../../common/utils/escape-ilike-pattern.util';
import { AdminListSuggestionsQueryDto } from './dto/admin-list-suggestions-query.dto';
import { CreateSuggestionDto } from './dto/create-suggestion.dto';
import { ListSuggestionsQueryDto } from './dto/list-suggestions-query.dto';
import { ProductSuggestionDetailResponseDto } from './dto/product-suggestion-detail-response.dto';
import {
  ProductSuggestionResponseDto,
  ProductSuggestionsResponseDto,
} from './dto/product-suggestion-response.dto';
import { ReviewSuggestionDto } from './dto/review-suggestion.dto';
import { ProductSuggestion } from './entities/product-suggestion.entity';
import { ProductSuggestionStatus } from './enums/product-suggestion-status.enum';

@Injectable()
export class ProductSuggestionsService {
  private readonly logger = new Logger(ProductSuggestionsService.name);

  constructor(
    @InjectRepository(ProductSuggestion)
    private readonly suggestionsRepository: Repository<ProductSuggestion>,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
  ) {}

  /**
   * SUGGEST-01 — create luôn PENDING, không nhận status/reviewer từ client (api-contract.md dòng
   * 509). 409 nếu customer đã có suggestion PENDING cùng tên. Dùng `.exists()` thay vì `findOne()`
   * (CODING_STANDARD.md mục 18). Race giữa 2 request giống hệt tên chưa được khoá — database.md mục
   * 4 và index list (mục 5) không yêu cầu lock/unique cho path này, khác với checkout/order
   * status/chat OPEN (CODING_STANDARD.md mục 22 dòng 971).
   */
  async create(
    customerId: string,
    dto: CreateSuggestionDto,
  ): Promise<ProductSuggestionResponseDto> {
    const duplicatePending = await this.suggestionsRepository.exists({
      where: {
        customerId,
        name: dto.name,
        status: ProductSuggestionStatus.PENDING,
      },
    });
    if (duplicatePending) {
      throw new ConflictException(
        this.i18n.t('errors.duplicatePendingSuggestion'),
      );
    }

    const suggestion = this.suggestionsRepository.create({
      customerId,
      name: dto.name,
      description: dto.description ?? null,
      categoryName: dto.categoryName ?? null,
      status: ProductSuggestionStatus.PENDING,
    });
    await this.suggestionsRepository.save(suggestion);
    this.logger.log(
      `Customer ${customerId} created suggestion ${suggestion.id}`,
    );
    return ProductSuggestionResponseDto.fromEntity(suggestion);
  }

  /** SUGGEST-02 — chỉ suggestion của current customer. */
  async listForCustomer(
    customerId: string,
    query: ListSuggestionsQueryDto,
  ): Promise<ProductSuggestionsResponseDto> {
    const queryBuilder = this.baseSummaryQuery().where(
      'suggestion.customerId = :customerId',
      { customerId },
    );
    if (query.status) {
      queryBuilder.andWhere('suggestion.status = :status', {
        status: query.status,
      });
    }
    queryBuilder.take(query.limit).skip(query.offset);

    const [suggestions, suggestionsCount] =
      await queryBuilder.getManyAndCount();
    return ProductSuggestionsResponseDto.fromEntities(
      suggestions,
      suggestionsCount,
    );
  }

  /** SUGGEST-03 — thêm filter `userId`/`keyword` so với bản customer, không giới hạn theo chủ suggestion. */
  async listForAdmin(
    query: AdminListSuggestionsQueryDto,
  ): Promise<ProductSuggestionsResponseDto> {
    const queryBuilder = this.baseSummaryQuery();
    if (query.status) {
      queryBuilder.andWhere('suggestion.status = :status', {
        status: query.status,
      });
    }
    if (query.userId) {
      queryBuilder.andWhere('suggestion.customerId = :userId', {
        userId: query.userId,
      });
    }
    if (query.keyword) {
      queryBuilder.andWhere("suggestion.name ILIKE :keyword ESCAPE '\\'", {
        keyword: `%${escapeIlikePattern(query.keyword)}%`,
      });
    }
    queryBuilder.take(query.limit).skip(query.offset);

    const [suggestions, suggestionsCount] =
      await queryBuilder.getManyAndCount();
    return ProductSuggestionsResponseDto.fromEntities(
      suggestions,
      suggestionsCount,
    );
  }

  /** SUGGEST-04 — chỉ trả customer id/username, không email/password/token. */
  async getDetailForAdmin(
    id: string,
  ): Promise<ProductSuggestionDetailResponseDto> {
    const suggestion = await this.suggestionsRepository
      .createQueryBuilder('suggestion')
      .innerJoin('suggestion.customer', 'customer')
      .select([
        'suggestion.id',
        'suggestion.name',
        'suggestion.description',
        'suggestion.categoryName',
        'suggestion.status',
        'suggestion.reviewedBy',
        'suggestion.reviewReason',
        'suggestion.reviewedAt',
        'suggestion.createdAt',
        'suggestion.updatedAt',
        'customer.id',
        'customer.username',
      ])
      .where('suggestion.id = :id', { id })
      .getOne();
    if (!suggestion) {
      throw new NotFoundException(this.i18n.t('errors.suggestionNotFound'));
    }
    return ProductSuggestionDetailResponseDto.fromEntity(suggestion);
  }

  /**
   * SUGGEST-05 — chỉ PENDING được review, đúng một lần; gọi lặp trả 409 (api-contract.md dòng 509).
   * Khoá row trước khi đọc/ghi status — database.md mục 4: "Service khóa row rồi chỉ cho PENDING →
   * APPROVED|REJECTED", cùng khuôn mẫu với `OrdersService.updateStatusByAdmin` (đọc-rồi-ghi trên 1
   * row nhiều admin có thể đụng cùng lúc — CODING_STANDARD.md mục 22).
   */
  async reviewByAdmin(
    id: string,
    adminUserId: string,
    dto: ReviewSuggestionDto,
  ): Promise<ProductSuggestionResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const suggestionsRepository = manager.getRepository(ProductSuggestion);
      const suggestion = await suggestionsRepository.findOne({
        select: { id: true, status: true },
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!suggestion) {
        throw new NotFoundException(this.i18n.t('errors.suggestionNotFound'));
      }
      if (suggestion.status !== ProductSuggestionStatus.PENDING) {
        throw new ConflictException(
          this.i18n.t('errors.invalidSuggestionTransition'),
        );
      }

      const isRejected = dto.status === ProductSuggestionStatus.REJECTED;
      await suggestionsRepository.update(id, {
        status: dto.status,
        reviewedBy: adminUserId,
        reviewedAt: new Date(),
        reviewReason: isRejected ? (dto.reason ?? '').trim() : null,
      });
      this.logger.log(
        `Admin ${adminUserId} moved suggestion ${id} to ${dto.status}`,
      );

      const updated = await suggestionsRepository.findOneOrFail({
        where: { id },
      });
      return ProductSuggestionResponseDto.fromEntity(updated);
    });
  }

  private baseSummaryQuery(): SelectQueryBuilder<ProductSuggestion> {
    return this.suggestionsRepository
      .createQueryBuilder('suggestion')
      .select([
        'suggestion.id',
        'suggestion.customerId',
        'suggestion.name',
        'suggestion.categoryName',
        'suggestion.status',
        'suggestion.reviewedBy',
        'suggestion.reviewReason',
        'suggestion.reviewedAt',
        'suggestion.createdAt',
        'suggestion.updatedAt',
      ])
      .orderBy('suggestion.createdAt', 'DESC')
      .addOrderBy('suggestion.id', 'DESC');
  }
}
