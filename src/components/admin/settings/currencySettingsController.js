const CONFLICT_CODES = new Set(['CURRENCY_CONFLICT', 'ADMIN_TARGET_CHANGED']);

export function isCurrencyRevisionConflict(error) {
  return error?.status === 409 || CONFLICT_CODES.has(String(error?.code || '').toUpperCase());
}

function requireCurrencyResponse(response) {
  if (!response?.success || !response.currency || !Number.isInteger(Number(response.currency.revision))) {
    const error = new Error('The server returned an invalid currency configuration.');
    error.code = 'INVALID_CURRENCY_RESPONSE';
    throw error;
  }
  return response.currency;
}

/**
 * Save controller kept independent from React/Firebase so concurrency behavior
 * can be unit tested at the HTTP boundary. A 409 always reloads MariaDB-owned
 * state exactly once and never reports the stale mutation as successful.
 */
export async function saveCurrencySettingsWithRecovery({ update, reload, payload }) {
  try {
    const response = await update(payload);
    return { kind: 'saved', response, currency: requireCurrencyResponse(response) };
  } catch (error) {
    if (!isCurrencyRevisionConflict(error)) throw error;
    try {
      const latestResponse = await reload();
      return {
        kind: 'conflict',
        conflict: error,
        response: latestResponse,
        currency: requireCurrencyResponse(latestResponse),
      };
    } catch (reloadError) {
      const recoveryError = new Error('Currency settings changed, but the latest authoritative values could not be reloaded. Retry refresh before saving.');
      recoveryError.code = 'CURRENCY_CONFLICT_RELOAD_FAILED';
      recoveryError.status = reloadError?.status || 503;
      recoveryError.cause = reloadError;
      throw recoveryError;
    }
  }
}
