/**
 * Deepgram's Model Improvement Program may keep audio to train its models.
 * Every request opts out unless DEEPGRAM_MIP_OPT_OUT=false. Opting out can
 * change the price of the platform's own Deepgram account; with BYOK it is
 * the customer's own agreement with Deepgram that applies.
 */
export const deepgramPrivacyOptions = (): { mip_opt_out?: boolean } =>
  process.env.DEEPGRAM_MIP_OPT_OUT === "false" ? {} : { mip_opt_out: true };
