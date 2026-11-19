import { Component, Injector, HostListener, ChangeDetectionStrategy } from '@angular/core';
import { SharedModule } from '@ui/shared.module';
import { BaseMainModuleComponent } from '@ui/base/base-main-module.component';
import { LandingPageService } from './landing-page.service';

interface CatalogCard {
  title: string;
  subtitle: string;
  imgUrl: string;
  alt: string;
  placeholder: 'placeholder-1' | 'placeholder-2' | 'placeholder-3';
}

interface CatalogSection {
  key: string;
  name: string;
  title: string;
  short: string;
  iconPath: string;
  iconBg?: string;
  iconColor?: string;
  cards: CatalogCard[];
}

interface GalleryItem {
  src: string;
  alt: string;
  title: string;
  subtitle: string;
  sectionName: string;
}

interface StatItem { value: string; label: string; iconPath: string; }
interface FeatureItem { iconPath: string; title: string; desc: string; }
interface StepItem { num: string; title: string; desc: string; iconPath: string; }
interface FilterItem { key: string; label: string; }

/**
 * Trang giới thiệu — KHUNG TRỐNG (project trắng, không nội dung).
 * Điền dữ liệu vào <c>sections</c> / <c>stats</c> / <c>features</c> / <c>steps</c> thì khối tương ứng tự hiện; mảng rỗng thì khối tự ẩn.
 * Chữ tĩnh (tiêu đề, mô tả hero, chân trang) sửa trong landing-page.component.html.
 */
@Component({
  selector: 'app-landing-page',
  templateUrl: './landing-page.component.html',
  styleUrls: ['./landing-page.component.scss'],
  imports: [SharedModule],
  providers: [LandingPageService],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true
})
export class LandingPageComponent extends BaseMainModuleComponent<any, LandingPageService> {
  /** Nhóm danh mục (mỗi nhóm một khối thẻ ảnh có lightbox). */
  sections: CatalogSection[] = [];

  /** Số liệu nổi bật ở hero. */
  stats: StatItem[] = [];

  /** Thẻ "điểm nổi bật". */
  features: FeatureItem[] = [];

  /** Các bước quy trình. */
  steps: StepItem[] = [];

  /** Bộ lọc nhóm: "Tất cả" + mỗi nhóm một nút (suy ra từ <c>sections</c>). */
  get filters(): FilterItem[] {
    return [{ key: 'all', label: 'Tất cả' }, ...this.sections.map(s => ({ key: s.key, label: s.title }))];
  }

  activeFilter = 'all';
  searchTerm = '';

  gallery: GalleryItem[] = [];
  lightboxOpen = false;
  currentIdx = 0;

  constructor(injector: Injector) {
    super(injector, LandingPageService);
    this.buildGallery();
  }

  override ngOnInit() { }

  override ngAfterViewInit(): void {
    super.ngAfterViewInit();
  }

  @HostListener('window:resize')
  override onWindowResize(): void { }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent) {
    if (!this.lightboxOpen) return;
    if (e.key === 'Escape') this.closeLightbox();
    if (e.key === 'ArrowLeft') this.navLightbox(-1);
    if (e.key === 'ArrowRight') this.navLightbox(1);
  }

  private buildGallery() {
    this.gallery = [];
    for (const section of this.sections) {
      for (const card of section.cards) {
        this.gallery.push({
          src: card.imgUrl,
          alt: card.alt,
          title: card.title,
          subtitle: card.subtitle,
          sectionName: section.name
        });
      }
    }
  }

  get totalCards(): number {
    return this.sections.reduce((acc, s) => acc + s.cards.length, 0);
  }

  /** Sections sau khi áp filter + search — vẫn giữ structure để render section header */
  get visibleSections(): CatalogSection[] {
    const term = this.searchTerm.trim().toLowerCase();
    return this.sections
      .filter(s => this.activeFilter === 'all' || s.key === this.activeFilter)
      .map(s => ({
        ...s,
        cards: term
          ? s.cards.filter(c =>
              c.title.toLowerCase().includes(term) ||
              c.subtitle.toLowerCase().includes(term))
          : s.cards
      }))
      .filter(s => s.cards.length > 0);
  }

  setFilter(key: string) {
    this.activeFilter = key;
  }

  clearSearch() {
    this.searchTerm = '';
  }

  scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Find index trong gallery theo card object — gallery build từ data gốc, không bị filter ảnh hưởng */
  private galleryIndexOfCard(card: CatalogCard): number {
    return this.gallery.findIndex(g => g.src === card.imgUrl);
  }

  isFirstThumbOfSection(idx: number): boolean {
    let acc = 0;
    for (const section of this.sections) {
      if (idx === acc) return true;
      acc += section.cards.length;
    }
    return false;
  }

  sectionNameAt(idx: number): string {
    let acc = 0;
    for (const section of this.sections) {
      if (idx === acc) return section.name;
      acc += section.cards.length;
    }
    return '';
  }

  openLightboxByCard(card: CatalogCard) {
    const idx = this.galleryIndexOfCard(card);
    this.currentIdx = idx >= 0 ? idx : 0;
    this.lightboxOpen = true;
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.scrollActiveThumbIntoView(), 0);
  }

  closeLightbox() {
    this.lightboxOpen = false;
    document.body.style.overflow = '';
  }

  showImage(idx: number) {
    this.currentIdx = idx;
    setTimeout(() => this.scrollActiveThumbIntoView(), 0);
  }

  navLightbox(dir: number) {
    if (this.gallery.length === 0) return;
    let n = this.currentIdx + dir;
    if (n < 0) n = this.gallery.length - 1;
    if (n >= this.gallery.length) n = 0;
    this.showImage(n);
  }

  onOverlayClick(e: MouseEvent, overlay: HTMLElement) {
    if (e.target === overlay) this.closeLightbox();
  }

  private scrollActiveThumbIntoView() {
    const el = document.querySelector('.lb-thumb.active');
    if (el && (el as any).scrollIntoView) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  get currentItem(): GalleryItem | null {
    return this.gallery[this.currentIdx] ?? null;
  }
}
