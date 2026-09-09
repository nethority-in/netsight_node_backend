
//   Twilio WhatsApp Template Configuration
//   Maps template names to Twilio template IDs


export interface TwilioTemplateMapping {
  templateName: string;
  templateId: string;
}

export const TWILIO_TEMPLATE_MAPPINGS: Record<string, string> = {
  // Daily reports template
  'netsightsdailyreports1': 'HX76ba66f51b489342b00955c8da29806b',
  'daily_kpi_snapshot': 'HX76ba66f51b489342b00955c8da29806b', // Alias for backward compatibility
  // Order templates
  'delivered': 'HX14df1fb125270b547f85a598947f0f25',
  'fulfilled': 'HX13ca3ad806735481e0b6deae183ff4da',
  'new_order': 'HX6eec80a39c157cbce668ae712dcc3276',
  // Daily report (Store Name, Previous Date, Revenue, Orders, AOV, % changes, ROAS, CAC, CM, Metrics)
  'copy_netsightsdailyreports_13feb': 'HXd3e6b94d9b76a3ec28be26827b64319f',
  'netsightsdailyreportsv2':'HX27ed4797a3fa27a27dc7b6fdae359149',
  // copy_netsightsdailyreportsv2: body params (Twilio: no spaces in names) → Store_Name, Previous_Date, Revenue, Orders, AOV, Revenue_Percent_Change, Orders_Percent_Change, Fb_ROAS, GoogleAds_ROAS
  'copy_netsightsdailyreportsv2':'HXfc65d48b6c59b6a83934b1620cbe45aa',
  'new_order_1': 'HX58c582e386bba2b32d315ac1c944d983',
  'new_order_2': 'HXd95c79e63775b1e352e4faca22238a77',
  'copy_new_order_2':'HXe983efd49b2124c574b391d9595838d0',
  // Additional mappings can be added here
  'days_comparison':"HX3626f7195c6dabd89ada8d9ef8529742",
  'weeklyreport':"HX5cc19404b60ec57af5b865e2449e7e31",
  'copy_weeklyreport':"HX20598758fa7247a30f2161db7ff43a84",
  'netsight_dailyreport_7day':"HXee48a4e4ba57b4a15c9e445f08d64322",
  // '6amcxosummary1':"HXb5cec0d34449468a20c16b0a05e3dd3f",
  '6amcxosummary1':"HX43f900aa486be9a9bc632734b1b333b2",
  '6amcxosummary11032026':"HXc4def48a4f3634141447094664c979e3",
  // 'netsight_dailyreport_7day_bestsell':"HX82487e826116ddd742e563a9c28"
  'netsight_dailyreport_7day_bestsell':"HXe70face30e556b6d380bdc2a8f0d9abd",
  '6amcxosummary':"HX1099c41bb1638c1e8f2aec47ff3675f5",
  '6amcxosummary16032026':"HX6b44b0fd9660c34d9dff5c4f5b1fea63",
  '1copy6amcxosummary16032026':"HX17e78dd0871a92464b0658bd6ce88d42",
  'dailysummarybutton':"HXf82c046e1613965e524303f5fda7068e",
  'daily_store_performance_update_v3':"HXcbeb93e547c743ad86b3017d3ad0d8aa",
  'dailysummarybutton_v11':"HX7b6ed2f024036ecee86cdb6f951fd504",
  'copy_weeklysummarybutton_v2':"HX598393d1f31fda2cf55d31f3a573b59a",
  'weeklysummarybutton_v2':"HX0d98892566677e30adda841b523e440f",
  'monthlysummarybutton_v2':"HX68444cd7dc6bc1ef7a48fa521f200309",
  'weeklycxosummary':'HX482b0c55a71c4f13177ed08a3aeb1a95',
  "monthlycxosummary":'HXfb90159cb745b508e85c2263fd8970fa',
  "executive_summary_daily":'HX47b5f2a92adc70a2099073d9be46ab5f',
  "copy_demo_onboarding_message":'HXc11abcaad2104c6b576de625496e9b71',
  "executivesummarydaily":'HX9411efbbf70b16fbc4961287e3c4c38c',
  //latest on working
  "ceodailysummarytemplate":'HX60498c7e828299978d04f1e6893cc99b',
  "ceoweeklysummarytemplate":'HX2363e9b3152e6b76f77116fdbc51fc18',
  "ceomonthlysummarytemplate":'HX964f596f8d3c01740c5b8aeeb45bb1eb',
  "copy_executivesummarydaily":'HXeb73ec3c633a5a02c02ebdc727c05cb6',
  "executivesummaryweeklymonthly":'HX376fa75f8be59b60ccb713d852d185d2',
  "trial_after_expiry_reminder_new":'HX5870797abc2f3aef9c8d863ac05d2fb0',
  "trial_period_ending":'HX34edeca12f91002c41bf0d80f733513d',
  "trial_period_ended_new":'HXddd74bad4ad05882994e620c85f2723d',
  "welcome_login":'HX0998c25074557a7c7e9387f16a3a8707',
  "invitation_template":'HX33616373bcb9e5b079957906535abc8a',
  'dailysummarybutton_v13':"HX695b612a3cafcb61fa6283b2e216baa8",
  'copy_weeklysummarybutton_v3':"HXdfff846d13a70b45a4cf472a7427915e",
  'monthlysummarybutton_v3':"HX9856ed4251519f647ca744df939cd9f5",
  'store_invitation1':"HXbaada95dfd9d6db37f9af9d1f688faa9",
  'store_invitation':"HX601129de027ff7f4b55cd547da0af10b",
  'store_invitation2':"HXb8fc0bee400154986a7ad86688dc7b3c",
  'view_report':"HX4d9646554715b009986934820a0ba610",
  'sd':"HX181e8a77619cd6c88e1741bd63ef564a",
  'pdf':"HX8e6b9057e4a1a58fcad2099c98385ae3",
  'view_report_pdf_img':"HX8054b45bc78b01540a63791b564d4672",
  'view_report_pdf_img_v2':"HX8ce6e580dbe228fc5cf3127ce0e09306",
};

export function getTwilioTemplateId(templateName: string): string | null {
  return TWILIO_TEMPLATE_MAPPINGS[templateName] || null;
}

export function getAllTwilioTemplateMappings(): Record<string, string> {
  return { ...TWILIO_TEMPLATE_MAPPINGS };
}


