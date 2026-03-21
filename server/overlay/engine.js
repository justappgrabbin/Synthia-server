const crypto = require('crypto');

class PersonalOverlayEngine {
  constructor(supabase, stellar) {
    this.supabase = supabase;
    this.stellar = stellar;
  }

  async getOrCreateOverlay(userAddress) {
    const { data } = await this.supabase
      .from('user_overlays')
      .select('*')
      .eq('user_address', userAddress)
      .single();
    
    if (data) return data;
    
    const overlay = {
      user_address: userAddress,
      overlay_address: `OVER-${Date.now()}`,
      personal_agents: [],
      created_at: new Date().toISOString()
    };
    
    await this.supabase.from('user_overlays').insert(overlay);
    return overlay;
  }
}

module.exports = PersonalOverlayEngine;
