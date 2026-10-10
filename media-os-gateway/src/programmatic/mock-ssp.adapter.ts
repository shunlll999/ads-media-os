import { Injectable } from '@nestjs/common'
import type { Profile } from './contracts.js'
export interface SspAdapter {
  readonly mode: 'mock' | 'partner'
  testInventory(profile: Profile): Promise<{ accepted: boolean; message: string }>
}
/** Replace this provider with a vendor adapter when credentials and contracts are available. */
@Injectable()
export class MockSspAdapter implements SspAdapter {
  readonly mode = 'mock' as const
  async testInventory(profile: Profile) {
    return {
      accepted: profile.width > 0 && profile.height > 0 && Boolean(profile.sspInventoryId),
      message: 'Mock SSP contract accepted. Partner connectivity is not tested.',
    }
  }
}
