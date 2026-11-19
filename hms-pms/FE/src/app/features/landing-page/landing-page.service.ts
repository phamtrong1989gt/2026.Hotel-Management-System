import { Injectable, Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AppClientSettings } from '@core/services/settings.service';
import { AppCommonService } from '@core/services/app.common.service';
import { BaseCrudService } from '@core/base/base-crud.service';
@Injectable()
export class LandingPageService extends BaseCrudService<any, any> {
  constructor(
    http: HttpClient,
    appClientSettings: AppClientSettings,
    appCommon: AppCommonService
  ) {
    super(http, appCommon, appClientSettings.settings.serverAPI + '/api/admin/LandingPage', appClientSettings.settings.reportAPI);
  }
}
