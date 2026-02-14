import { App, FuzzySuggestModal, TFile } from "obsidian";
import { t } from "../i18n";

/**
 * Vault内ファイル選択モーダル
 * FuzzySuggestModal継承でファジー検索対応
 */
export class FilePickerModal extends FuzzySuggestModal<TFile> {
	private onChoose: (file: TFile) => void;
	private files: TFile[];

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.files = app.vault.getMarkdownFiles().sort((a, b) =>
			a.path.localeCompare(b.path)
		);
		this.setPlaceholder(t("filePicker.placeholder"));
	}

	getItems(): TFile[] {
		return this.files;
	}

	getItemText(item: TFile): string {
		return item.path;
	}

	onChooseItem(item: TFile): void {
		this.onChoose(item);
	}
}
