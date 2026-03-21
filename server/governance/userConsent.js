class UserConsentLayer {
  constructor(supabase, governance) {
    this.supabase = supabase;
    this.governance = governance;
  }

  async checkConsent(update, userAddress) {
    return {
      status: 'pending_consent',
      requiresAction: true
    };
  }
}

module.exports = UserConsentLayer;
