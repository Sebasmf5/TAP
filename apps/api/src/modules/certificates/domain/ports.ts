import type {
  CertificateEntity,
  CertificateTemplateEntity,
  CertificateTemplateSnapshot,
} from './entities.ts';

export interface InsertCertificateInput {
  id: string;
  organizationId: string;
  eventId: string;
  personId: string;
  templateId: string | null;
  code: string;
  templateSnapshot: CertificateTemplateSnapshot;
  pdfPath: string | null;
  pdfSha256: string | null;
  issuedAt: Date;
}

export interface CertificatesRepository {
  listTemplates(organizationId: string): Promise<CertificateTemplateEntity[]>;
  findTemplateById(
    organizationId: string,
    templateId: string,
  ): Promise<CertificateTemplateEntity | null>;
  findDefaultTemplate(organizationId: string): Promise<CertificateTemplateEntity | null>;
  createTemplate(template: CertificateTemplateEntity): Promise<CertificateTemplateEntity>;
  updateTemplate(template: CertificateTemplateEntity): Promise<CertificateTemplateEntity>;
  clearDefaultTemplates(organizationId: string): Promise<void>;

  insertCertificateIfNotIssued(
    input: InsertCertificateInput,
  ): Promise<{ created: boolean; certificate: CertificateEntity }>;
  updateCertificatePdf(
    organizationId: string,
    certificateId: string,
    pdfPath: string,
    pdfSha256: string,
  ): Promise<CertificateEntity | null>;
  markCertificateDelivered(
    organizationId: string,
    certificateId: string,
    deliveredAt: Date,
  ): Promise<CertificateEntity | null>;
  revokeCertificate(params: {
    organizationId: string;
    certificateId: string;
    revokedAt: Date;
    revokedByUserId: string;
    reason: string;
  }): Promise<CertificateEntity | null>;
  findById(organizationId: string, certificateId: string): Promise<CertificateEntity | null>;
  findByCodePublic(code: string): Promise<CertificateEntity | null>;
  incrementVerificationCount(certificateId: string): Promise<void>;
  listByEvent(organizationId: string, eventId: string): Promise<CertificateEntity[]>;
}

export interface RenderCertificatePdfInput {
  code: string;
  verificationUrl: string;
  snapshot: CertificateTemplateSnapshot;
  issuedAt: Date;
}

export interface CertificatePdfRenderer {
  renderCertificatePdf(input: RenderCertificatePdfInput): Promise<{
    pdfBuffer: Buffer;
    sha256: string;
  }>;
}
