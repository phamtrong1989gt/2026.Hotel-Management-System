import { provideZoneChangeDetection } from "@angular/core";
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { registerLocaleData } from '@angular/common';
import localeVi from '@angular/common/locales/vi';
import { logPlatformBanner } from '@platform/versions';

registerLocaleData(localeVi, 'vi-VN');
logPlatformBanner();   // in version Platform Kit ra console lúc boot

bootstrapApplication(AppComponent, {...appConfig, providers: [provideZoneChangeDetection(), ...appConfig.providers]})
  .catch((err) => console.error(err));
