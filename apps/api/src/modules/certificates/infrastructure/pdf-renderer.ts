import { createHash } from 'node:crypto';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { CertificatePdfRenderer, RenderCertificatePdfInput } from '../domain/ports.ts';

/**
 * Adaptador PDFKit + QRCode para renderizar certificados verificables en servidor sin navegador headless (`AGENTS.md` A4, A6).
 */
export class PdfKitCertificateRenderer implements CertificatePdfRenderer {
  public async renderCertificatePdf(input: RenderCertificatePdfInput): Promise<{
    pdfBuffer: Buffer;
    sha256: string;
  }> {
    const qrPngBuffer = await QRCode.toBuffer(input.verificationUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 140,
      color: {
        dark: '#061b31',
        light: '#ffffff',
      },
    });

    const isLandscape = input.snapshot.orientation === 'landscape';
    const doc = new PDFDocument({
      size: 'A4',
      layout: isLandscape ? 'landscape' : 'portrait',
      margin: 48,
      info: {
        Title: `${input.snapshot.title} — ${input.snapshot.holderName}`,
        Author: input.snapshot.organizationName,
        Subject: `Certificado ${input.code} — ${input.snapshot.eventName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finishedPromise = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // Marco institucional sobrio (estilo Ledger)
    doc
      .save()
      .lineWidth(1.5)
      .strokeColor('#061b31')
      .rect(28, 28, pageWidth - 56, pageHeight - 56)
      .stroke()
      .lineWidth(0.5)
      .strokeColor('#533afd')
      .rect(34, 34, pageWidth - 68, pageHeight - 68)
      .stroke()
      .restore();

    // Encabezado de la entidad emisora
    doc
      .fillColor('#533afd')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(input.snapshot.organizationName.toUpperCase(), 60, 56, {
        width: pageWidth - 120,
        align: 'left',
      });

    doc
      .fillColor('#061b31')
      .font('Helvetica-Bold')
      .fontSize(24)
      .text(input.snapshot.title, 60, 82, {
        width: pageWidth - 120,
        align: 'left',
      });

    doc
      .fillColor('#64748d')
      .font('Helvetica')
      .fontSize(11)
      .text('Otorgado a:', 60, 125, {
        width: pageWidth - 120,
      });

    // Nombre del titular
    doc
      .fillColor('#061b31')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text(input.snapshot.holderName, 60, 144, {
        width: pageWidth - 120,
      });

    // Línea divisoria fina
    doc
      .save()
      .moveTo(60, 178)
      .lineTo(pageWidth - 60, 178)
      .lineWidth(0.75)
      .strokeColor('#e5edf5')
      .stroke()
      .restore();

    // Texto principal interpolado
    doc
      .fillColor('#273951')
      .font('Helvetica')
      .fontSize(13)
      .text(input.snapshot.bodyText, 60, 196, {
        width: pageWidth - 240,
        lineGap: 5,
      });

    // Firmantes en la parte inferior izquierda
    const signersY = pageHeight - 150;
    const signers = input.snapshot.signers.slice(0, 3);
    const signerBoxWidth = 170;

    signers.forEach((signer, idx) => {
      const x = 60 + idx * (signerBoxWidth + 28);
      doc
        .save()
        .moveTo(x, signersY)
        .lineTo(x + signerBoxWidth, signersY)
        .lineWidth(0.75)
        .strokeColor('#64748d')
        .stroke()
        .restore();

      doc
        .fillColor('#061b31')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(signer.name, x, signersY + 8, { width: signerBoxWidth });

      doc
        .fillColor('#64748d')
        .font('Helvetica')
        .fontSize(9)
        .text(signer.role, x, signersY + 22, { width: signerBoxWidth });
    });

    // Bloque de verificación con QR a la derecha
    const qrBoxX = pageWidth - 190;
    const qrBoxY = pageHeight - 200;

    doc.image(qrPngBuffer, qrBoxX + 15, qrBoxY, {
      width: 105,
      height: 105,
    });

    doc
      .fillColor('#061b31')
      .font('Courier-Bold')
      .fontSize(9.5)
      .text(`CÓDIGO: ${input.code}`, qrBoxX, qrBoxY + 112, {
        width: 135,
        align: 'center',
      });

    doc
      .fillColor('#64748d')
      .font('Helvetica')
      .fontSize(7.5)
      .text(`Verificable en:\n${input.verificationUrl}`, qrBoxX - 10, qrBoxY + 126, {
        width: 155,
        align: 'center',
      });

    doc.end();

    const pdfBuffer = await finishedPromise;
    const sha256 = createHash('sha256').update(pdfBuffer).digest('hex');

    return { pdfBuffer, sha256 };
  }
}
