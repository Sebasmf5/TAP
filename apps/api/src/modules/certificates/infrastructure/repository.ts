import type { CertificateOrientation, CertificateStatus } from '@tap/contracts';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DrizzleExecutor } from '../../../shared/index.ts';
import type { CertificateEntity, CertificateTemplateEntity } from '../domain/entities.ts';

type DrizzleDb = DrizzleExecutor;
import type { CertificatesRepository, InsertCertificateInput } from '../domain/ports.ts';
import { certificateTemplatesTable, certificatesTable } from './schema.ts';

function mapTemplateRow(
  row: typeof certificateTemplatesTable.$inferSelect,
): CertificateTemplateEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    title: row.title,
    bodyTemplate: row.bodyTemplate,
    logoUrl: row.logoUrl ?? null,
    signers: row.signers ?? [],
    orientation: (row.orientation as CertificateOrientation) ?? 'landscape',
    version: row.version,
    isDefault: row.isDefault,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapCertificateRow(row: typeof certificatesTable.$inferSelect): CertificateEntity {
  return {
    id: row.id,
    organizationId: row.organizationId,
    eventId: row.eventId,
    personId: row.personId,
    templateId: row.templateId ?? null,
    code: row.code,
    status: row.status as CertificateStatus,
    templateSnapshot: row.templateSnapshot,
    pdfPath: row.pdfPath ?? null,
    pdfSha256: row.pdfSha256 ?? null,
    issuedAt: row.issuedAt,
    deliveredAt: row.deliveredAt ?? null,
    revokedAt: row.revokedAt ?? null,
    revokedByUserId: row.revokedByUserId ?? null,
    revokedReason: row.revokedReason ?? null,
    verificationCount: row.verificationCount,
  };
}

export class DrizzleCertificatesRepository implements CertificatesRepository {
  private readonly db: DrizzleDb;

  public constructor(db: DrizzleDb) {
    this.db = db;
  }

  public async listTemplates(organizationId: string): Promise<CertificateTemplateEntity[]> {
    const rows = await this.db
      .select()
      .from(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.organizationId, organizationId))
      .orderBy(
        desc(certificateTemplatesTable.isDefault),
        desc(certificateTemplatesTable.updatedAt),
      );
    return rows.map(mapTemplateRow);
  }

  public async findTemplateById(
    organizationId: string,
    templateId: string,
  ): Promise<CertificateTemplateEntity | null> {
    const rows = await this.db
      .select()
      .from(certificateTemplatesTable)
      .where(
        and(
          eq(certificateTemplatesTable.organizationId, organizationId),
          eq(certificateTemplatesTable.id, templateId),
        ),
      )
      .limit(1);
    return rows[0] ? mapTemplateRow(rows[0]) : null;
  }

  public async findDefaultTemplate(
    organizationId: string,
  ): Promise<CertificateTemplateEntity | null> {
    const rows = await this.db
      .select()
      .from(certificateTemplatesTable)
      .where(eq(certificateTemplatesTable.organizationId, organizationId))
      .orderBy(desc(certificateTemplatesTable.isDefault), desc(certificateTemplatesTable.updatedAt))
      .limit(1);
    return rows[0] ? mapTemplateRow(rows[0]) : null;
  }

  public async clearDefaultTemplates(organizationId: string): Promise<void> {
    await this.db
      .update(certificateTemplatesTable)
      .set({ isDefault: false })
      .where(eq(certificateTemplatesTable.organizationId, organizationId));
  }

  public async createTemplate(
    template: CertificateTemplateEntity,
  ): Promise<CertificateTemplateEntity> {
    const rows = await this.db
      .insert(certificateTemplatesTable)
      .values({
        id: template.id,
        organizationId: template.organizationId,
        title: template.title,
        bodyTemplate: template.bodyTemplate,
        logoUrl: template.logoUrl,
        signers: template.signers,
        orientation: template.orientation,
        version: template.version,
        isDefault: template.isDefault,
        createdAt: template.createdAt,
        updatedAt: template.updatedAt,
      })
      .returning();
    if (!rows[0]) throw new Error('Error al crear plantilla de certificado');
    return mapTemplateRow(rows[0]);
  }

  public async updateTemplate(
    template: CertificateTemplateEntity,
  ): Promise<CertificateTemplateEntity> {
    const rows = await this.db
      .update(certificateTemplatesTable)
      .set({
        title: template.title,
        bodyTemplate: template.bodyTemplate,
        logoUrl: template.logoUrl,
        signers: template.signers,
        orientation: template.orientation,
        version: template.version,
        isDefault: template.isDefault,
        updatedAt: template.updatedAt,
      })
      .where(
        and(
          eq(certificateTemplatesTable.organizationId, template.organizationId),
          eq(certificateTemplatesTable.id, template.id),
        ),
      )
      .returning();
    if (!rows[0]) throw new Error('Error al actualizar plantilla de certificado');
    return mapTemplateRow(rows[0]);
  }

  public async insertCertificateIfNotIssued(
    input: InsertCertificateInput,
  ): Promise<{ created: boolean; certificate: CertificateEntity }> {
    const inserted = await this.db
      .insert(certificatesTable)
      .values({
        id: input.id,
        organizationId: input.organizationId,
        eventId: input.eventId,
        personId: input.personId,
        templateId: input.templateId,
        code: input.code,
        status: 'issued',
        templateSnapshot: input.templateSnapshot,
        pdfPath: input.pdfPath,
        pdfSha256: input.pdfSha256,
        issuedAt: input.issuedAt,
        deliveredAt: null,
        revokedAt: null,
        revokedByUserId: null,
        revokedReason: null,
        verificationCount: 0,
      })
      .onConflictDoNothing({
        target: [certificatesTable.eventId, certificatesTable.personId],
        where: sql`${certificatesTable.status} = 'issued'`,
      })
      .returning();

    const first = inserted[0];
    if (first) {
      return { created: true, certificate: mapCertificateRow(first) };
    }

    const existing = await this.db
      .select()
      .from(certificatesTable)
      .where(
        and(
          eq(certificatesTable.organizationId, input.organizationId),
          eq(certificatesTable.eventId, input.eventId),
          eq(certificatesTable.personId, input.personId),
          eq(certificatesTable.status, 'issued'),
        ),
      )
      .limit(1);

    if (!existing[0]) {
      throw new Error('Inconsistencia al recuperar certificado activo existente');
    }

    return { created: false, certificate: mapCertificateRow(existing[0]) };
  }

  public async updateCertificatePdf(
    organizationId: string,
    certificateId: string,
    pdfPath: string,
    pdfSha256: string,
  ): Promise<CertificateEntity | null> {
    const rows = await this.db
      .update(certificatesTable)
      .set({ pdfPath, pdfSha256 })
      .where(
        and(
          eq(certificatesTable.organizationId, organizationId),
          eq(certificatesTable.id, certificateId),
        ),
      )
      .returning();
    return rows[0] ? mapCertificateRow(rows[0]) : null;
  }

  public async markCertificateDelivered(
    organizationId: string,
    certificateId: string,
    deliveredAt: Date,
  ): Promise<CertificateEntity | null> {
    const rows = await this.db
      .update(certificatesTable)
      .set({ deliveredAt })
      .where(
        and(
          eq(certificatesTable.organizationId, organizationId),
          eq(certificatesTable.id, certificateId),
        ),
      )
      .returning();
    return rows[0] ? mapCertificateRow(rows[0]) : null;
  }

  public async revokeCertificate(params: {
    organizationId: string;
    certificateId: string;
    revokedAt: Date;
    revokedByUserId: string;
    reason: string;
  }): Promise<CertificateEntity | null> {
    const rows = await this.db
      .update(certificatesTable)
      .set({
        status: 'revoked',
        revokedAt: params.revokedAt,
        revokedByUserId: params.revokedByUserId,
        revokedReason: params.reason,
      })
      .where(
        and(
          eq(certificatesTable.organizationId, params.organizationId),
          eq(certificatesTable.id, params.certificateId),
        ),
      )
      .returning();
    return rows[0] ? mapCertificateRow(rows[0]) : null;
  }

  public async findById(
    organizationId: string,
    certificateId: string,
  ): Promise<CertificateEntity | null> {
    const rows = await this.db
      .select()
      .from(certificatesTable)
      .where(
        and(
          eq(certificatesTable.organizationId, organizationId),
          eq(certificatesTable.id, certificateId),
        ),
      )
      .limit(1);
    return rows[0] ? mapCertificateRow(rows[0]) : null;
  }

  public async findByCodePublic(code: string): Promise<CertificateEntity | null> {
    const normalized = code.trim().toUpperCase();
    const rows = await this.db
      .select()
      .from(certificatesTable)
      .where(eq(certificatesTable.code, normalized))
      .limit(1);
    return rows[0] ? mapCertificateRow(rows[0]) : null;
  }

  public async incrementVerificationCount(certificateId: string): Promise<void> {
    await this.db
      .update(certificatesTable)
      .set({
        verificationCount: sql`${certificatesTable.verificationCount} + 1`,
      })
      .where(eq(certificatesTable.id, certificateId));
  }

  public async listByEvent(organizationId: string, eventId: string): Promise<CertificateEntity[]> {
    const rows = await this.db
      .select()
      .from(certificatesTable)
      .where(
        and(
          eq(certificatesTable.organizationId, organizationId),
          eq(certificatesTable.eventId, eventId),
        ),
      )
      .orderBy(desc(certificatesTable.issuedAt));
    return rows.map(mapCertificateRow);
  }
}

export class InMemoryCertificatesRepository implements CertificatesRepository {
  private readonly templates = new Map<string, CertificateTemplateEntity>();
  private readonly certificates = new Map<string, CertificateEntity>();

  public async listTemplates(organizationId: string): Promise<CertificateTemplateEntity[]> {
    return Array.from(this.templates.values())
      .filter((t) => t.organizationId === organizationId)
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      })
      .map((t) => ({ ...t, signers: [...t.signers] }));
  }

  public async findTemplateById(
    organizationId: string,
    templateId: string,
  ): Promise<CertificateTemplateEntity | null> {
    const t = this.templates.get(templateId);
    if (!t || t.organizationId !== organizationId) return null;
    return { ...t, signers: [...t.signers] };
  }

  public async findDefaultTemplate(
    organizationId: string,
  ): Promise<CertificateTemplateEntity | null> {
    const list = await this.listTemplates(organizationId);
    return list[0] ?? null;
  }

  public async clearDefaultTemplates(organizationId: string): Promise<void> {
    for (const [id, t] of this.templates.entries()) {
      if (t.organizationId === organizationId && t.isDefault) {
        this.templates.set(id, { ...t, isDefault: false });
      }
    }
  }

  public async createTemplate(
    template: CertificateTemplateEntity,
  ): Promise<CertificateTemplateEntity> {
    const copy: CertificateTemplateEntity = { ...template, signers: [...template.signers] };
    this.templates.set(copy.id, copy);
    return { ...copy };
  }

  public async updateTemplate(
    template: CertificateTemplateEntity,
  ): Promise<CertificateTemplateEntity> {
    const copy: CertificateTemplateEntity = { ...template, signers: [...template.signers] };
    this.templates.set(copy.id, copy);
    return { ...copy };
  }

  public async insertCertificateIfNotIssued(
    input: InsertCertificateInput,
  ): Promise<{ created: boolean; certificate: CertificateEntity }> {
    for (const existing of this.certificates.values()) {
      if (
        existing.organizationId === input.organizationId &&
        existing.eventId === input.eventId &&
        existing.personId === input.personId &&
        existing.status === 'issued'
      ) {
        return { created: false, certificate: { ...existing } };
      }
    }

    const record: CertificateEntity = {
      id: input.id,
      organizationId: input.organizationId,
      eventId: input.eventId,
      personId: input.personId,
      templateId: input.templateId,
      code: input.code.toUpperCase(),
      status: 'issued',
      templateSnapshot: {
        ...input.templateSnapshot,
        signers: [...input.templateSnapshot.signers],
      },
      pdfPath: input.pdfPath,
      pdfSha256: input.pdfSha256,
      issuedAt: input.issuedAt,
      deliveredAt: null,
      revokedAt: null,
      revokedByUserId: null,
      revokedReason: null,
      verificationCount: 0,
    };
    this.certificates.set(record.id, record);
    return { created: true, certificate: { ...record } };
  }

  public async updateCertificatePdf(
    organizationId: string,
    certificateId: string,
    pdfPath: string,
    pdfSha256: string,
  ): Promise<CertificateEntity | null> {
    const found = this.certificates.get(certificateId);
    if (!found || found.organizationId !== organizationId) return null;
    const updated: CertificateEntity = { ...found, pdfPath, pdfSha256 };
    this.certificates.set(certificateId, updated);
    return { ...updated };
  }

  public async markCertificateDelivered(
    organizationId: string,
    certificateId: string,
    deliveredAt: Date,
  ): Promise<CertificateEntity | null> {
    const found = this.certificates.get(certificateId);
    if (!found || found.organizationId !== organizationId) return null;
    const updated: CertificateEntity = { ...found, deliveredAt };
    this.certificates.set(certificateId, updated);
    return { ...updated };
  }

  public async revokeCertificate(params: {
    organizationId: string;
    certificateId: string;
    revokedAt: Date;
    revokedByUserId: string;
    reason: string;
  }): Promise<CertificateEntity | null> {
    const found = this.certificates.get(params.certificateId);
    if (!found || found.organizationId !== params.organizationId) return null;
    const updated: CertificateEntity = {
      ...found,
      status: 'revoked',
      revokedAt: params.revokedAt,
      revokedByUserId: params.revokedByUserId,
      revokedReason: params.reason,
    };
    this.certificates.set(params.certificateId, updated);
    return { ...updated };
  }

  public async findById(
    organizationId: string,
    certificateId: string,
  ): Promise<CertificateEntity | null> {
    const found = this.certificates.get(certificateId);
    if (!found || found.organizationId !== organizationId) return null;
    return { ...found };
  }

  public async findByCodePublic(code: string): Promise<CertificateEntity | null> {
    const normalized = code.trim().toUpperCase();
    for (const cert of this.certificates.values()) {
      if (cert.code === normalized) {
        return { ...cert };
      }
    }
    return null;
  }

  public async incrementVerificationCount(certificateId: string): Promise<void> {
    const found = this.certificates.get(certificateId);
    if (found) {
      this.certificates.set(certificateId, {
        ...found,
        verificationCount: found.verificationCount + 1,
      });
    }
  }

  public async listByEvent(organizationId: string, eventId: string): Promise<CertificateEntity[]> {
    return Array.from(this.certificates.values())
      .filter((c) => c.organizationId === organizationId && c.eventId === eventId)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
      .map((c) => ({ ...c }));
  }
}
