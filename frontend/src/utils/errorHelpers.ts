/**
 * Format API error responses into user-friendly messages
 */
export function formatApiError(error: unknown, defaultMessage: string): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null) {
    const apiError = error as any;

    // Handle 403 Forbidden specially
    if (apiError.statusCode === 403) {
      return "Access denied: You don't have permission to access this resource. Please check your credentials or contact your administrator.";
    }

    // Handle other status codes
    if (apiError.statusCode) {
      return `API Error ${apiError.statusCode}: ${
        apiError.message || "Unknown error"
      }`;
    }

    // Handle error with just a message
    if (apiError.message) {
      return apiError.message;
    }
  }

  return defaultMessage;
}
