import PDFDocument from 'pdfkit';
import type { LoanDto } from '@tap/contracts';

export class PdfKitLoanReceiptRenderer {
  public async renderReceiptPdf(params: {
    loan: LoanDto;
    organizationName: string;
  }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A5',
        margin: 32,
        info: {
          Title: `Comprobante de Préstamo ${params.loan.unitCode}`,
          Author: params.organizationName,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc
        .fillColor('#533afd')
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(params.organizationName.toUpperCase(), { align: 'left' });

      doc
        .moveDown(0.3)
        .fillColor('#061b31')
        .font('Helvetica-Bold')
        .fontSize(16)
        .text('Comprobante de Préstamo de Implemento');

      doc
        .moveDown(0.5)
        .strokeColor('#e5edf5')
        .lineWidth(1)
        .moveTo(32, doc.y)
        .lineTo(doc.page.width - 32, doc.y)
        .stroke();

      doc.moveDown(0.8);

      const fields: Array<[string, string]> = [
        ['ID del préstamo', params.loan.id],
        ['Punto de préstamo', params.loan.lendingPointName],
        ['Prestatario', `${params.loan.borrowerName} (${params.loan.maskedDocument})`],
        ['Implemento', `${params.loan.modelName} — Unidad ${params.loan.unitCode}`],
        ['Estado actual', params.loan.status],
        ['Condición de entrega', params.loan.conditionOut],
        ['Fecha límite de devolución', params.loan.dueAt],
        ['Fecha de devolución', params.loan.returnedAt ?? 'Pendiente'],
        ['Huella SHA-256 de firma digital', params.loan.signatureSha256],
      ];

      for (const [label, value] of fields) {
        doc.fillColor('#64748d').font('Helvetica-Bold').fontSize(8.5).text(label.toUpperCase());
        doc.fillColor('#061b31').font('Helvetica').fontSize(10).text(value);
        doc.moveDown(0.45);
      }

      doc
        .moveDown(0.6)
        .fillColor('#64748d')
        .font('Helvetica')
        .fontSize(7.5)
        .text(
          'Documento generado por Tap conforme a la autorización de tratamiento de datos personales (Ley 1581 de 2012) y registro de firma manuscrita digitalizada.',
        );

      doc.end();
    });
  }
}
