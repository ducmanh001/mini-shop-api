import { ALLOWED_ATTACHMENT_MIME_TYPES } from '../constants/attachments.constants';

/** Dùng lại ở entity, service, interceptor — một nguồn duy nhất cho tập MIME được phép. */
export type AttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number];
