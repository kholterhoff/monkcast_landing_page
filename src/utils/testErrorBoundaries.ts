// Test utilities for error boundaries
import { 
  withApiErrorBoundary, 
  ExternalApiError, 
  CircuitBreaker,
  ApiHealthMonitor 
} from './errorBoundary.js';

// Test function to simulate API failures
export async function testApiFailure(
  failureType: 'network' | 'timeout' | 'server' | 'data' = 'network'
): Promise<never> {
  const errors = {
    network: () => new ExternalApiError('Network connection failed', undefined, 'NETWORK_ERROR'),
    timeout: () => new ExternalApiError('Request timeout', 408, 'TIMEOUT'),
    server: () => new ExternalApiError('Internal server error', 500, 'SERVER_ERROR'),
    data: () => new ExternalApiError('Invalid data format', undefined, 'INVALID_DATA')
  };

  throw errors[failureType]();
}

// Test function to simulate successful API call
export async function testApiSuccess(data: any = { success: true }): Promise<any> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100));
  return data;
}

// Test error boundary with different scenarios
export async function runErrorBoundaryTests() {
  console.log('🧪 Running Error Boundary Tests...');
  
  const results = {
    networkError: false,
    timeoutError: false,
    serverError: false,
    dataError: false,
    successWithFallback: false,
    circuitBreaker: false
  };

  // Test 1: Network Error with Fallback
  try {
    const result = await withApiErrorBoundary<{ message: string }>({
      operation: () => testApiFailure('network'),
      fallbackData: { message: 'Fallback data' },
      context: 'Network Error Test'
    });
    
    results.networkError = result.isStale && result.data.message === 'Fallback data';
    console.log('✅ Network error with fallback:', results.networkError);
  } catch (error) {
    const err = error as Error;
    console.log('❌ Network error test failed:', err.message);
  }

  // Test 2: Timeout Error
  try {
    const result = await withApiErrorBoundary<{ message: string }>({
      operation: () => testApiFailure('timeout'),
      fallbackData: { message: 'Timeout fallback' },
      context: 'Timeout Test'
    });
    
    results.timeoutError = result.isStale && result.error?.code === 'TIMEOUT';
    console.log('✅ Timeout error test:', results.timeoutError);
  } catch (error) {
    const err = error as Error;
    console.log('❌ Timeout error test failed:', err.message);
  }

  // Test 3: Server Error
  try {
    const result = await withApiErrorBoundary<{ message: string }>({
      operation: () => testApiFailure('server'),
      fallbackData: { message: 'Server error fallback' },
      context: 'Server Error Test'
    });
    
    results.serverError = result.isStale && result.error?.status === 500;
    console.log('✅ Server error test:', results.serverError);
  } catch (error) {
    const err = error as Error;
    console.log('❌ Server error test failed:', err.message);
  }

  // Test 4: Success Case
  try {
    const result = await withApiErrorBoundary<{ message: string }>({
      operation: () => testApiSuccess({ message: 'Success!' }),
      fallbackData: { message: 'Should not use this' },
      context: 'Success Test'
    });
    
    results.successWithFallback = !result.isStale && result.data.message === 'Success!';
    console.log('✅ Success test:', results.successWithFallback);
  } catch (error) {
    const err = error as Error;
    console.log('❌ Success test failed:', err.message);
  }

  // Test 5: Circuit Breaker
  try {
    const circuitBreaker = new CircuitBreaker(2, 1000); // 2 failures, 1s recovery
    
    // Trigger failures to open circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(() => testApiFailure('network'));
      } catch (error) {
        // Expected to fail
      }
    }
    
    // Circuit should be open now
    results.circuitBreaker = circuitBreaker.getState() === 'OPEN';
    console.log('✅ Circuit breaker test:', results.circuitBreaker);
  } catch (error) {
    const err = error as Error;
    console.log('❌ Circuit breaker test failed:', err.message);
  }

  // Test 6: Health Monitor
  try {
    const healthMonitor = new ApiHealthMonitor();
    
    const healthStatus = await healthMonitor.checkHealth(
      'test-api',
      () => testApiFailure('network')
    );
    
    console.log('✅ Health monitor test:', !healthStatus.isHealthy);
  } catch (error) {
    const err = error as Error;
    console.log('❌ Health monitor test failed:', err.message);
  }

  console.log('🏁 Error Boundary Tests Complete');
  console.log('Results:', results);
  
  return results;
}

// Export for use in development/testing
if (typeof window !== 'undefined') {
  (window as any).testErrorBoundaries = runErrorBoundaryTests;
}