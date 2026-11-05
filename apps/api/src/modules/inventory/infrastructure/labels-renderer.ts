import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { InventoryUnitEntity } from '../domain/entities.ts';

export interface UnitLabelItem {
  unit: InventoryUnitEntity;
  modelName: string;
  organizationName: string;
}

export class PdfKitUnitLabelsRenderer {
  public async renderLabelsPdf(items: UnitLabelItem[]): Promise<Buffer> {
    const qrBuffers = await Promise.all(
      items.map((item) =>
        QRCode.toBuffer(item.unit.qrToken, {
          type: 'png',
          margin: 1,
          width: 110,
          errorCorrectionLevel: 'M',
        }),
      ),
    );

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 28,
        info: {
          Title: 'Etiquetas QR de Inventario - Tap',
          Author: 'Tap',
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      const cols = 3;
      const cardWidth = 172;
      const cardHeight = 104;
      const gapX = 12;
      const gapY = 12;
      const startX = 28;
      const startY = 36;

      items.forEach((item, index) => {
        if (index > 0 && index % 18 === 0) {
          doc.addPage();
        }
        const pageIndex = index % 18;
        const col = pageIndex % cols;
        const row = Math.floor(pageIndex / cols);
        const x = startX + col * (cardWidth + gapX);
        const y = startY + row * (cardHeight + gapY);

        doc
          .roundedRect(x, y, cardWidth, cardHeight, 4)
          .lineWidth(0.8)
          .strokeColor('#cbd5e1')
          .stroke();

        const qrBuf = qrBuffers[index];
        if (qrBuf) {
          doc.image(qrBuf, x + 8, y + 12, { width: 76, height: 76 });
        }

        doc
          .fillColor('#061b31')
          .font('Helvetica-Bold')
          .fontSize(10)
          .text(item.unit.code, x + 90, y + 16, { width: 74 });

        doc
          .fillColor('#273951')
          .font('Helvetica')
          .fontSize(7.5)
          .text(item.modelName, x + 90, y + 32, { width: 74, height: 32 });

        doc
          .fillColor('#64748d')
          .font('Helvetica')
          .fontSize(6.5)
          .text(item.organizationName, x + 90, y + 68, { width: 74 });
      });

      doc.end();
    });
  }
}
