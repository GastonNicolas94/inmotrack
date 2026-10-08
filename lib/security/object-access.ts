import { HttpError } from '@/lib/http-error';

export function assertOwnerObjectAccess(user: { idPropietario: number | null }, id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0 || (user.idPropietario !== null && user.idPropietario !== id)) {
    throw new HttpError('NOT_FOUND', 'Recurso no encontrado.', 404);
  }
}
