// Error boundary utilities for handling external API failures
export interface ApiError {
  message: string;
  status?: number;
  code?: string;
  timestamp: number;
  url?: string;
}

export class ExternalApiError extends Error {
  public status?: number;
  public code?: string;
  public url?: string;
  public timestamp: number;

  constructor(message: string, status?: number, code?: string, url?: string) {
    super(message);
    this.name = 'ExternalApiError';
    this.status = status;
    this.code = code;
    this.url = url;
    this.timestamp = Date.now();
  }
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2
};

// Exponential backoff with jitter
export function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  // Add jitter (±25% randomization)
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, cappedDelay + jitter);
}

// Generic retry wrapper with exponential backoff
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  context?: string
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      console.warn(`${context || 'Operation'} failed on attempt ${attempt}/${config.maxAttempts}:`, lastError.message);
      
      if (attempt === config.maxAttempts) {
        break;
      }

      const delay = calculateDelay(attempt, config);
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new ExternalApiError(
    `${context || 'Operation'} failed after ${config.maxAttempts} attempts: ${lastError!.message}`,
    lastError instanceof ExternalApiError ? lastError.status : undefined,
    'MAX_RETRIES_EXCEEDED'
  );
}

// Circuit breaker pattern for preventing cascading failures
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        if (fallback) {
          return fallback();
        }
        throw new ExternalApiError('Circuit breaker is OPEN', undefined, 'CIRCUIT_BREAKER_OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      if (fallback) {
        return fallback();
      }
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  getState(): string {
    return this.state;
  }
}

// Safe fetch wrapper with timeout and error handling
export async function safeFetch(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        'User-Agent': 'MonkCast/1.0',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        ...fetchOptions.headers
      }
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new ExternalApiError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status,
        'HTTP_ERROR',
        url
      );
    }
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof ExternalApiError) {
      throw error;
    }
    
    const err = error as Error;
    if (err.name === 'AbortError') {
      throw new ExternalApiError(`Request timeout after ${timeout}ms`, 408, 'TIMEOUT', url);
    }
    
    throw new ExternalApiError(
      `Network error: ${err.message}`,
      undefined,
      'NETWORK_ERROR',
      url
    );
  }
}

// Fallback data provider
export interface FallbackData<T> {
  data: T;
  isStale: boolean;
  timestamp: number;
}

export function createFallbackProvider<T>(defaultData: T) {
  let cachedData: FallbackData<T> | null = null;
  
  return {
    set(data: T): void {
      cachedData = {
        data,
        isStale: false,
        timestamp: Date.now()
      };
    },
    
    get(maxAge: number = 3600000): FallbackData<T> { // 1 hour default
      if (cachedData && Date.now() - cachedData.timestamp < maxAge) {
        return cachedData;
      }
      
      return {
        data: defaultData,
        isStale: true,
        timestamp: 0
      };
    },
    
    markStale(): void {
      if (cachedData) {
        cachedData.isStale = true;
      }
    }
  };
}

// Enhanced error boundary wrapper for API operations
export interface ApiErrorBoundaryOptions<T> {
  operation: () => Promise<T>;
  fallbackData?: T;
  retryConfig?: Partial<RetryConfig>;
  circuitBreaker?: CircuitBreaker;
  context?: string;
  onError?: (error: ExternalApiError) => void;
  onFallback?: (data: T, isStale: boolean) => void;
}

export async function withApiErrorBoundary<T>(
  options: ApiErrorBoundaryOptions<T>
): Promise<{ data: T; isStale: boolean; error?: ExternalApiError }> {
  const {
    operation,
    fallbackData,
    retryConfig = {},
    circuitBreaker,
    context = 'API Operation',
    onError,
    onFallback
  } = options;

  const finalRetryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };

  try {
    let result: T;

    if (circuitBreaker) {
      result = await circuitBreaker.execute(
        () => withRetry(operation, finalRetryConfig, context),
        fallbackData ? () => fallbackData : undefined
      );
    } else {
      result = await withRetry(operation, finalRetryConfig, context);
    }

    return { data: result, isStale: false };
  } catch (error) {
    const err = error as Error;
    const apiError = error instanceof ExternalApiError 
      ? error 
      : new ExternalApiError(
          `${context} failed: ${err.message}`,
          undefined,
          'UNKNOWN_ERROR'
        );

    // Call error handler if provided
    if (onError) {
      try {
        onError(apiError);
      } catch (handlerError) {
        console.warn('Error handler failed:', handlerError);
      }
    }

    // Use fallback data if available
    if (fallbackData !== undefined) {
      if (onFallback) {
        try {
          onFallback(fallbackData, true);
        } catch (handlerError) {
          console.warn('Fallback handler failed:', handlerError);
        }
      }
      return { data: fallbackData, isStale: true, error: apiError };
    }

    // Re-throw if no fallback available
    throw apiError;
  }
}

// Health check utilities for monitoring API status
export interface ApiHealthStatus {
  isHealthy: boolean;
  lastCheck: number;
  consecutiveFailures: number;
  averageResponseTime: number;
  lastError?: ExternalApiError;
}

export class ApiHealthMonitor {
  private healthStatus: Map<string, ApiHealthStatus> = new Map();
  private responseTimes: Map<string, number[]> = new Map();

  async checkHealth(
    apiName: string,
    healthCheck: () => Promise<void>,
    timeout: number = 5000
  ): Promise<ApiHealthStatus> {
    const startTime = Date.now();
    let status = this.healthStatus.get(apiName) || {
      isHealthy: true,
      lastCheck: 0,
      consecutiveFailures: 0,
      averageResponseTime: 0
    };

    try {
      await Promise.race([
        healthCheck(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Health check timeout')), timeout)
        )
      ]);

      const responseTime = Date.now() - startTime;
      this.updateResponseTimes(apiName, responseTime);

      status = {
        isHealthy: true,
        lastCheck: Date.now(),
        consecutiveFailures: 0,
        averageResponseTime: this.calculateAverageResponseTime(apiName),
        lastError: undefined
      };
    } catch (error) {
      const err = error as Error;
      const apiError = error instanceof ExternalApiError 
        ? error 
        : new ExternalApiError(`Health check failed: ${err.message}`);

      status = {
        ...status,
        isHealthy: false,
        lastCheck: Date.now(),
        consecutiveFailures: status.consecutiveFailures + 1,
        lastError: apiError
      };
    }

    this.healthStatus.set(apiName, status);
    return status;
  }

  private updateResponseTimes(apiName: string, responseTime: number): void {
    const times = this.responseTimes.get(apiName) || [];
    times.push(responseTime);
    
    // Keep only last 10 response times
    if (times.length > 10) {
      times.shift();
    }
    
    this.responseTimes.set(apiName, times);
  }

  private calculateAverageResponseTime(apiName: string): number {
    const times = this.responseTimes.get(apiName) || [];
    if (times.length === 0) return 0;
    
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  getHealthStatus(apiName: string): ApiHealthStatus | undefined {
    return this.healthStatus.get(apiName);
  }

  getAllHealthStatuses(): Map<string, ApiHealthStatus> {
    return new Map(this.healthStatus);
  }
}