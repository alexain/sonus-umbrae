export class ConfigScreenNavigator {
  private selectionIndex = 0;

  constructor(private readonly screen: HTMLElement) {}

  reset(): void {
    this.selectionIndex = 0;
    this.updateSelection();
  }

  updateSelection(): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    this.selectionIndex = Math.max(0, Math.min(rows.length - 1, this.selectionIndex));
    rows.forEach((row, index) => row.classList.toggle('selected', index === this.selectionIndex));
    rows[this.selectionIndex].scrollIntoView({ block: 'nearest' });
  }

  selectRow(row: HTMLElement): void {
    const rows = this.rows();
    const index = rows.indexOf(row);
    if (index < 0) return;
    this.selectionIndex = index;
    this.updateSelection();
  }

  moveSelection(direction: -1 | 1): void {
    const rows = this.rows();
    if (rows.length === 0) return;
    this.selectionIndex = (this.selectionIndex + direction + rows.length) % rows.length;
    this.updateSelection();
  }

  activate(direction: -1 | 0 | 1): void {
    const row = this.rows()[this.selectionIndex];
    if (!row) return;
    const control = row.querySelector<HTMLInputElement | HTMLSelectElement>('input, select');
    if (!control || control.disabled) return;

    if (control instanceof HTMLInputElement && control.type === 'checkbox') {
      control.checked = direction === 0 ? !control.checked : direction > 0;
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

    if (control instanceof HTMLInputElement && control.type === 'text') {
      if (direction === 0) {
        control.focus();
        control.select();
      }
      return;
    }

    if (control instanceof HTMLInputElement && control.type === 'range') {
      if (direction === 0) return;
      const step = Number(control.step || '1') || 1;
      const min = Number(control.min || '0');
      const max = Number(control.max || '100');
      control.value = String(Math.max(min, Math.min(max, Number(control.value) + direction * step)));
      control.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    if (control instanceof HTMLSelectElement) this.cycleSelect(control, direction === 0 ? 1 : direction);
  }

  private rows(): HTMLElement[] {
    return [...this.screen.querySelectorAll<HTMLElement>('.config-row[data-config-key]')];
  }

  private cycleSelect(select: HTMLSelectElement, direction: -1 | 1): void {
    if (select.options.length === 0 || select.disabled) return;
    const index = Math.max(0, select.selectedIndex);
    select.selectedIndex = (index + direction + select.options.length) % select.options.length;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}
