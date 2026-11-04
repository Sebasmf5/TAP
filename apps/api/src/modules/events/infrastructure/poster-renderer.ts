import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import type { EventEntity } from '../domain/entities.ts';
import type { EventPosterRenderer } from '../domain/ports.ts';

export class PdfKitEventPosterRenderer implements EventPosterRenderer {
  async generateQrCodes(checkinUrl: string): Promise<{ qrDataUrl: string; qrSvg: string }> {
    const [qrDataUrl, qrSvg] = await Promise.all([
      QRCode.toDataURL(checkinUrl, {
        width: 360,
        margin: 2,
        color: {
          dark: '#061b31',
          light: '#ffffff',
        },
      }),
      QRCode.toString(checkinUrl, {
        type: 'svg',
        margin: 2,
        color: {
          dark: '#061b31',
          light: '#ffffff',
        },
      }),
    ]);

    return { qrDataUrl, qrSvg };
  }

  async renderPosterPdf(params: {
    event: EventEntity;
    organizationName: string;
    siteName: string | null;
    checkinUrl: string;
  }): Promise<Buffer> {
    const qrBuffer = await QRCode.toBuffer(params.checkinUrl, {
      type: 'png',
      width: 260,
      margin: 2,
      color: {
        dark: '#061b31',
        light: '#ffffff',
      },
    });

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 48,
        info: {
          Title: `Afiche de asistencia — ${params.event.name}`,
          Author: params.organizationName,
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err) => reject(err));

      // Encabezado institucional
      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#533afd')
        .text(params.organizationName.toUpperCase(), { align: 'left' });

      doc.moveDown(0.4);
      doc
        .font('Helvetica-Bold')
        .fontSize(26)
        .fillColor('#061b31')
        .text(params.event.name, { align: 'left' });

      if (params.event.description) {
        doc.moveDown(0.3);
        doc
          .font('Helvetica')
          .fontSize(12)
          .fillColor('#273951')
          .text(params.event.description, { align: 'left' });
      }

      doc.moveDown(0.6);
      const formattedDate = new Intl.DateTimeFormat('es-CO', {
        dateStyle: 'full',
        timeStyle: 'short',
        timeZone: 'America/Bogota',
      }).format(params.event.startsAt);

      doc
        .font('Helvetica')
        .fontSize(11)
        .fillColor('#64748d')
        .text(`Fecha y hora: ${formattedDate} (America/Bogota)`);

      if (params.siteName) {
        doc.text(`Sede / Lugar: ${params.siteName}`);
      }

      doc.moveDown(1.2);

      // Marco central con el código QR
      const qrSize = 230;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const qrX = doc.page.margins.left + (pageWidth - qrSize) / 2;
      const qrY = doc.y;

      doc
        .roundedRect(qrX - 16, qrY - 16, qrSize + 32, qrSize + 32, 8)
        .lineWidth(1)
        .strokeColor('#e5edf5')
        .stroke();

      doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

      doc.y = qrY + qrSize + 32;

      doc
        .font('Courier-Bold')
        .fontSize(16)
        .fillColor('#061b31')
        .text(`CÓDIGO DEL EVENTO: ${params.event.publicCode}`, { align: 'center' });

      doc.moveDown(0.3);
      doc
        .font('Courier')
        .fontSize(11)
        .fillColor('#273951')
        .text(params.checkinUrl, { align: 'center' });

      doc.moveDown(1.5);
      doc
        .font('Helvetica-Bold')
        .fontSize(14)
        .fillColor('#061b31')
        .text('¿Cómo registrar tu asistencia?', { align: 'left' });

      doc.moveDown(0.4);
      doc
        .font('Helvetica')
        .fontSize(12)
        .fillColor('#273951')
        .text('1. Abre la cámara de tu celular y apunta al código QR.')
        .moveDown(0.2)
        .text('2. Escribe tu número de documento o código institucional (no necesitas cuenta).')
        .moveDown(0.2)
        .text('3. Confirma tu identidad y guarda el comprobante en pantalla.');

      doc.end();
    });
  }
}
