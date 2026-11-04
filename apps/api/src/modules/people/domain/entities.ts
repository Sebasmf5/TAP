import {
  DocumentTypeSchema,
  PersonTypeSchema,
  type ConsentChannel,
  type DocumentType,
  type ImportRowIssue,
  type PersonDto,
  type PersonType,
} from '@tap/contracts';
import { ValidationError } from '../../../shared/index.ts';

export interface Person {
  readonly id: string;
  readonly organizationId: string;
  readonly documentType: DocumentType;
  readonly documentNumber: string;
  readonly institutionalCode: string | null;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly personType: PersonType;
  readonly isMinor: boolean;
  readonly guardianName: string | null;
  readonly guardianDocument: string | null;
  readonly guardianPhone: string | null;
  readonly qrToken: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DataConsent {
  readonly id: string;
  readonly organizationId: string;
  readonly personId: string;
  readonly version: string;
  readonly acceptedAt: Date;
  readonly channel: ConsentChannel;
  readonly ipHash: string | null;
}

/**
 * Enmascara el número de documento dejando visibles únicamente los últimos 4 caracteres (`•••1234`)
 * según AGENTS.md A7.4 y B2.2.
 */
export function maskDocumentNumber(documentNumber: string): string {
  const clean = documentNumber.trim();
  if (clean.length <= 4) {
    return `•••${clean}`;
  }
  return `•••${clean.slice(-4)}`;
}

/**
 * Devuelve el primer nombre e inicial del primer apellido («Juan P.») para confirmación pública
 * sin exponer datos personales completos de otra persona (AGENTS.md A7.2).
 */
export function abbreviatePersonName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Participante';
  const firstName = parts[0] ?? 'Participante';
  if (parts.length === 1) return firstName;
  const surnameIndex = parts.length >= 4 ? parts.length - 2 : parts.length - 1;
  const secondPart = parts[surnameIndex] ?? parts[1] ?? '';
  const initial = secondPart.charAt(0).toUpperCase();
  return initial ? `${firstName} ${initial}.` : firstName;
}

export function validateMinorGuardian(params: {
  isMinor: boolean;
  guardianName?: string | null;
  guardianPhone?: string | null;
}): void {
  if (params.isMinor && (!params.guardianName?.trim() || !params.guardianPhone?.trim())) {
    throw new ValidationError(
      'Los menores de edad requieren nombre y teléfono del acudiente (Ley 1581 de 2012).',
      [
        {
          path: 'guardianName',
          message: 'Registra el nombre y teléfono del acudiente para menores de edad.',
        },
      ],
    );
  }
}

export function toPersonDto(
  person: Person,
  options?: {
    maskSensitive?: boolean;
    latestConsent?: DataConsent | null;
  },
): PersonDto {
  const masked = maskDocumentNumber(person.documentNumber);
  return {
    id: person.id,
    organizationId: person.organizationId,
    documentType: person.documentType,
    documentNumber: options?.maskSensitive ? masked : person.documentNumber,
    maskedDocument: masked,
    institutionalCode: person.institutionalCode,
    fullName: person.fullName,
    abbreviatedName: abbreviatePersonName(person.fullName),
    email: person.email,
    phone: person.phone,
    personType: person.personType,
    isMinor: person.isMinor,
    guardianName: person.guardianName,
    guardianDocument: person.guardianDocument,
    guardianPhone: person.guardianPhone,
    qrToken: person.qrToken,
    latestConsentVersion: options?.latestConsent?.version ?? null,
    latestConsentAt: options?.latestConsent ? options.latestConsent.acceptedAt.toISOString() : null,
    createdAt: person.createdAt.toISOString(),
  };
}

export interface ParsedCsvPersonRow {
  readonly rowNumber: number;
  readonly documentType: DocumentType;
  readonly documentNumber: string;
  readonly institutionalCode: string | null;
  readonly fullName: string;
  readonly email: string | null;
  readonly phone: string | null;
  readonly personType: PersonType;
  readonly isMinor: boolean;
  readonly guardianName: string | null;
  readonly guardianDocument: string | null;
  readonly guardianPhone: string | null;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

/**
 * Parsea un archivo CSV (con separador `;` o `,`), valida fila por fila y devuelve
 * las filas válidas y la lista detallada de errores por número de fila.
 *
 * Columnas esperadas (insensibles a mayúsculas, en español o inglés):
 * document_type | tipo_documento, document_number | documento, institutional_code | codigo,
 * full_name | nombre, email | correo, phone | telefono, person_type | tipo_persona,
 * is_minor | es_menor, guardian_name | acudiente_nombre, guardian_phone | acudiente_telefono
 */
export function parseCsvPeople(csvContent: string): {
  totalRows: number;
  validRows: ParsedCsvPersonRow[];
  errors: ImportRowIssue[];
} {
  const normalizedContent = csvContent.replace(/^\uFEFF/, '').trim();
  if (!normalizedContent) {
    return { totalRows: 0, validRows: [], errors: [] };
  }

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length <= 1) {
    return { totalRows: 0, validRows: [], errors: [] };
  }

  const headerLine = lines[0] ?? '';
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headers = splitCsvLine(headerLine, delimiter).map((h) =>
    h
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_'),
  );

  const findIndex = (candidates: string[]): number =>
    headers.findIndex((h) => candidates.includes(h));

  const idxDocType = findIndex(['document_type', 'tipo_documento', 'tipo_doc']);
  const idxDocNumber = findIndex(['document_number', 'documento', 'numero_documento', 'cedula']);
  const idxCode = findIndex([
    'institutional_code',
    'codigo',
    'codigo_estudiantil',
    'codigo_institucional',
  ]);
  const idxName = findIndex(['full_name', 'nombre', 'nombre_completo', 'nombres']);
  const idxEmail = findIndex(['email', 'correo', 'correo_electronico']);
  const idxPhone = findIndex(['phone', 'telefono', 'celular']);
  const idxType = findIndex(['person_type', 'tipo_persona', 'rol', 'vinculo']);
  const idxMinor = findIndex(['is_minor', 'es_menor', 'menor']);
  const idxGuardianName = findIndex(['guardian_name', 'acudiente_nombre', 'acudiente']);
  const idxGuardianDoc = findIndex(['guardian_document', 'acudiente_documento']);
  const idxGuardianPhone = findIndex(['guardian_phone', 'acudiente_telefono']);

  const validRows: ParsedCsvPersonRow[] = [];
  const errors: ImportRowIssue[] = [];
  const seenDocsInFile = new Set<string>();

  for (let i = 1; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? '';
    const rowNumber = i + 1;
    const cells = splitCsvLine(rawLine, delimiter);

    const getCell = (idx: number): string => (idx >= 0 ? (cells[idx] ?? '').trim() : '');

    const rawDocType = (getCell(idxDocType) || 'CC').toUpperCase();
    const docTypeParsed = DocumentTypeSchema.safeParse(rawDocType);
    if (!docTypeParsed.success) {
      errors.push({
        rowNumber,
        field: 'document_type',
        message: `Tipo de documento inválido "${rawDocType}". Usa CC, TI, CE, PAS u OTRO.`,
        rawLine,
      });
      continue;
    }

    const docNumber = getCell(idxDocNumber);
    if (docNumber.length < 4 || docNumber.length > 32) {
      errors.push({
        rowNumber,
        field: 'document_number',
        message: 'El número de documento es obligatorio y debe tener entre 4 y 32 caracteres.',
        rawLine,
      });
      continue;
    }

    const docKey = `${docTypeParsed.data}:${docNumber}`;
    if (seenDocsInFile.has(docKey)) {
      errors.push({
        rowNumber,
        field: 'document_number',
        message: `Documento duplicado dentro del mismo archivo (${docKey}).`,
        rawLine,
      });
      continue;
    }

    const fullName = getCell(idxName);
    if (fullName.length < 2) {
      errors.push({
        rowNumber,
        field: 'full_name',
        message: 'El nombre completo es obligatorio (mínimo 2 caracteres).',
        rawLine,
      });
      continue;
    }

    const emailRaw = getCell(idxEmail);
    if (emailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      errors.push({
        rowNumber,
        field: 'email',
        message: `El correo electrónico "${emailRaw}" no tiene un formato válido.`,
        rawLine,
      });
      continue;
    }

    const rawPersonType = (getCell(idxType) || 'student').toLowerCase();
    const mappedPersonType =
      rawPersonType === 'estudiante'
        ? 'student'
        : rawPersonType === 'docente' || rawPersonType === 'profesor'
          ? 'teacher'
          : rawPersonType === 'administrativo' || rawPersonType === 'funcionario'
            ? 'administrative'
            : rawPersonType === 'externo'
              ? 'external'
              : rawPersonType;
    const personTypeParsed = PersonTypeSchema.safeParse(mappedPersonType);
    if (!personTypeParsed.success) {
      errors.push({
        rowNumber,
        field: 'person_type',
        message: `Tipo de persona inválido "${rawPersonType}".`,
        rawLine,
      });
      continue;
    }

    const rawMinor = getCell(idxMinor).toLowerCase();
    const isMinor =
      rawMinor === 'true' ||
      rawMinor === '1' ||
      rawMinor === 'si' ||
      rawMinor === 'sí' ||
      docTypeParsed.data === 'TI';

    const guardianName = getCell(idxGuardianName) || null;
    const guardianDocument = getCell(idxGuardianDoc) || null;
    const guardianPhone = getCell(idxGuardianPhone) || null;

    if (isMinor && (!guardianName || !guardianPhone)) {
      errors.push({
        rowNumber,
        field: 'guardian_name',
        message:
          'Los menores de edad requieren nombre y teléfono del acudiente (guardian_name y guardian_phone).',
        rawLine,
      });
      continue;
    }

    seenDocsInFile.add(docKey);
    validRows.push({
      rowNumber,
      documentType: docTypeParsed.data,
      documentNumber: docNumber,
      institutionalCode: getCell(idxCode) || null,
      fullName,
      email: emailRaw ? emailRaw.toLowerCase() : null,
      phone: getCell(idxPhone) || null,
      personType: personTypeParsed.data,
      isMinor,
      guardianName,
      guardianDocument,
      guardianPhone,
    });
  }

  return {
    totalRows: lines.length - 1,
    validRows,
    errors,
  };
}
