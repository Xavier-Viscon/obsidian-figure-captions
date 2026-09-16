import {
  App,
  MarkdownRenderChild,
  MarkdownPostProcessorContext,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  editorInfoField,
} from "obsidian";

import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

import {
  RangeSetBuilder,
  Prec,
} from "@codemirror/state";


interface RawFigureMatch {
  from: number;
  to: number;
  caption: string;
  path: string;
}

interface FigureMatch extends RawFigureMatch {
  number: number;
}

interface FigureCaptionsSettings {
  imageRadius: number;
  shadowEnabled: boolean;
  shadowBlur: number;
  shadowOpacity: number;
  captionSize: number;
  figureSpacing: number;
}

const DEFAULT_SETTINGS: FigureCaptionsSettings = {
  imageRadius: 20,
  shadowEnabled: true,
  shadowBlur: 20,
  shadowOpacity: 18,
  captionSize: 0.9,
  figureSpacing: 1.5,
};

// Matches: ![Caption](image.png "optional title")
const FIGURE_PATTERN =
  /!\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

function parseFigureMatches(text: string): RawFigureMatch[] {
  const matches: RawFigureMatch[] = [];
  const regex = new RegExp(FIGURE_PATTERN.source, "g");

  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const caption = match[1].trim();
    const path = match[2].trim();

    if (!caption) {
      continue;
    }

    matches.push({
      from: match.index,
      to: match.index + match[0].length,
      caption,
      path,
    });
  }

  return matches;
}

class FigureWidget extends WidgetType {
  constructor(
    private readonly imageSrc: string,
    private readonly captionText: string,
    private readonly figureNumber: number,
  ) {
    super();
  }

  toDOM(): HTMLElement {
    const root = document.createElement("span");
    root.className = "obsidian-figure";

    const img = document.createElement("img");
    img.src = this.imageSrc;
    img.alt = this.captionText;

    const captionEl = document.createElement("span");
    captionEl.className = "obsidian-figure-caption";

    const numberEl = document.createElement("span");
    numberEl.className = "figure-number";
    numberEl.textContent = `Figure ${this.figureNumber}`;

    const separatorEl = document.createElement("span");
    separatorEl.className = "figure-separator";
    separatorEl.textContent = " — ";

    const textEl = document.createElement("span");
    textEl.className = "figure-caption";
    textEl.textContent = this.captionText;

    captionEl.appendChild(numberEl);
    captionEl.appendChild(separatorEl);
    captionEl.appendChild(textEl);

    root.appendChild(img);
    root.appendChild(captionEl);

    return root;
  }

  eq(other: FigureWidget): boolean {
    return (
      this.imageSrc === other.imageSrc &&
      this.captionText === other.captionText &&
      this.figureNumber === other.figureNumber
    );
  }

  ignoreEvent(): boolean {
    return false;
  }
}

type ResolveImageFn = (path: string, view: EditorView) => string | null;

class FigureLivePreview implements PluginValue {
  decorations: DecorationSet;
  private figures: FigureMatch[];

  constructor(
    view: EditorView,
    private readonly resolveImage: ResolveImageFn,
  ) {
    this.figures = findFigures(view);
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.figures = findFigures(update.view);
    }

    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet
    ) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  destroy() {}

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    for (const figure of this.figures) {
      const isEditing = view.state.selection.ranges.some(
        (range) =>
          range.from <= figure.to && range.to >= figure.from,
      );

      if (isEditing) {
        continue;
      }

      const imageSrc = this.resolveImage(figure.path, view);

      if (!imageSrc) {
        continue;
      }

      builder.add(
        figure.from,
        figure.to,
        Decoration.replace({
          widget: new FigureWidget(
            imageSrc,
            figure.caption,
            figure.number,
          ),
        }),
      );
    }

    return builder.finish();
  }
}

function findFigures(view: EditorView): FigureMatch[] {
  const text = view.state.doc.toString();

  return parseFigureMatches(text).map((match, index) => ({
    ...match,
    number: index + 1,
  }));
}

interface DocumentFigureEntry {
  number: number;
  line: number;
}

function countNewlinesBefore(text: string, index: number): number {
  let count = 0;

  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) {
      count++;
    }
  }

  return count;
}

function buildDocumentFigureIndex(
  fullText: string,
): DocumentFigureEntry[] {
  return parseFigureMatches(fullText).map((match, index) => ({
    number: index + 1,
    line: countNewlinesBefore(fullText, match.from),
  }));
}

export default class FigureCaptionsPlugin extends Plugin {
  settings: FigureCaptionsSettings = { ...DEFAULT_SETTINGS };

  private figureIndexCache = new Map<
    string,
    { text: string; index: DocumentFigureEntry[] }
  >();

  onload() {
    console.log("Figure Captions: loaded");

    this.applySettings();
    this.addSettingTab(new FigureCaptionsSettingTab(this.app, this));

    void this.loadData().then((data) => {
      this.settings = {
        ...DEFAULT_SETTINGS,
        ...(data ?? {}),
      };
      this.applySettings();
    });

    this.registerEditorExtension(
      Prec.high(
        ViewPlugin.define(
          (view) =>
            new FigureLivePreview(view, this.resolveImage),
          {
            decorations: (value: FigureLivePreview) =>
              value.decorations,
          },
        ),
      ),
    );

    this.registerMarkdownPostProcessor(
      (element, context) =>
        this.processReadingViewSection(element, context),
      1000,
    );
  }

  onunload() {
    console.log("Figure Captions: unloaded");
    this.figureIndexCache.clear();
    this.clearSettingsStyles();
  }

  saveSettings() {
    return this.saveData(this.settings).then(() => {
      this.applySettings();
    });
  }

  private applySettings() {
    const root = document.documentElement;

    root.style.setProperty(
      "--figure-caption-image-radius",
      `${this.settings.imageRadius}px`,
    );
    root.style.setProperty(
      "--figure-caption-image-shadow",
      this.settings.shadowEnabled
        ? `0 8px ${this.settings.shadowBlur}px rgba(0, 0, 0, ${this.settings.shadowOpacity / 100})`
        : "none",
    );
    root.style.setProperty(
      "--figure-caption-size",
      `${this.settings.captionSize}em`,
    );
    root.style.setProperty(
      "--figure-caption-spacing",
      `${this.settings.figureSpacing}em`,
    );
  }

  private clearSettingsStyles() {
    const root = document.documentElement;

    root.style.removeProperty("--figure-caption-image-radius");
    root.style.removeProperty("--figure-caption-image-shadow");
    root.style.removeProperty("--figure-caption-size");
    root.style.removeProperty("--figure-caption-spacing");
  }

  private resolveSourcePath(view: EditorView): string {
    try {
      const info = view.state.field(editorInfoField, false);
      if (info?.file?.path) {
        return info.file.path;
      }
    } catch {
      // editorInfoField unavailable in this Obsidian API version.
    }
    return this.app.workspace.getActiveFile()?.path ?? "";
  }

  private resolveImage: ResolveImageFn = (path, view) => {
    const sourcePath = this.resolveSourcePath(view);

    const file = this.app.metadataCache.getFirstLinkpathDest(
      path,
      sourcePath,
    );

    if (!(file instanceof TFile)) {
      console.warn("Figure Captions: image not found:", path);
      return null;
    }

    return this.app.vault.getResourcePath(file);
  };

  private getDocumentFigureIndex(
    sourcePath: string,
    fullText: string,
  ): DocumentFigureEntry[] {
    const cached = this.figureIndexCache.get(sourcePath);

    if (cached && cached.text === fullText) {
      return cached.index;
    }

    const index = buildDocumentFigureIndex(fullText);
    this.figureIndexCache.set(sourcePath, { text: fullText, index });
    return index;
  }

  private processReadingViewSection(
    element: HTMLElement,
    context: MarkdownPostProcessorContext,
  ) {
    const sectionComponent = new MarkdownRenderChild(element);
    context.addChild(sectionComponent);

    const sectionInfo = context.getSectionInfo(element);
    const documentFigures = sectionInfo
      ? this.getDocumentFigureIndex(
          context.sourcePath,
          sectionInfo.text,
        )
      : null;
    const sectionStartLine = sectionInfo?.lineStart ?? 0;
    const sectionFigureOffset = documentFigures
      ? documentFigures.filter(
          (figure) => figure.line < sectionStartLine,
        ).length
      : 0;

    const processImages = () => {
      const images = element.querySelectorAll<HTMLImageElement>(
        "img",
      );

      let figureIndex = 0;

      for (const image of images) {
        const caption = image.alt.trim();

        if (!caption) {
          continue;
        }

        const figureNumber =
          documentFigures
            ? sectionFigureOffset + figureIndex + 1
            : figureIndex + 1;

        figureIndex++;

        if (image.dataset.figureCaptionProcessed === "true") {
          const existingNumber =
            image.parentElement?.querySelector<HTMLElement>(
              ".figure-number",
            );

          if (existingNumber) {
            existingNumber.textContent = `Figure ${figureNumber}`;
          }

          continue;
        }

        image.dataset.figureCaptionProcessed = "true";

        const figure = document.createElement("figure");
        figure.className = "obsidian-figure";

        const figcaption = document.createElement("figcaption");
        figcaption.className = "obsidian-figure-caption";

        const numberEl = document.createElement("span");
        numberEl.className = "figure-number";
        numberEl.textContent = `Figure ${figureNumber}`;

        const separatorEl = document.createElement("span");
        separatorEl.className = "figure-separator";
        separatorEl.textContent = " — ";

        const captionEl = document.createElement("span");
        captionEl.className = "figure-caption";
        captionEl.textContent = caption;

        figcaption.appendChild(numberEl);
        figcaption.appendChild(separatorEl);
        figcaption.appendChild(captionEl);

        const parent = image.parentElement;
        if (!parent) {
          continue;
        }

        parent.replaceChild(figure, image);
        figure.appendChild(image);
        figure.appendChild(figcaption);
      }

    };

    processImages();

    const observer = new MutationObserver(() => {
      processImages();

      const images = element.querySelectorAll<HTMLImageElement>(
        "img",
      );

      const allProcessed =
        images.length === 0 ||
        Array.from(images).every(
          (image) => image.dataset.figureCaptionProcessed === "true",
        );

      if (allProcessed) {
        observer.disconnect();
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
    });

    sectionComponent.register(() => observer.disconnect());
  }
}

class FigureCaptionsSettingTab extends PluginSettingTab {
  plugin: FigureCaptionsPlugin;

  constructor(app: App, plugin: FigureCaptionsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", {
      text: "Figure Captions",
    });

    new Setting(containerEl)
      .setName("Image corner radius")
      .setDesc("Round the corners of figure images.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 40, 1)
          .setValue(this.plugin.settings.imageRadius)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.imageRadius = value;
            void this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Image shadow")
      .setDesc("Show a shadow below figure images.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.shadowEnabled)
          .onChange((value) => {
            this.plugin.settings.shadowEnabled = value;
            void this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Shadow softness")
      .setDesc("Set how widely the image shadow spreads.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 50, 1)
          .setValue(this.plugin.settings.shadowBlur)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.shadowBlur = value;
            void this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Shadow opacity")
      .setDesc("Set the darkness of the image shadow.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 100, 1)
          .setValue(this.plugin.settings.shadowOpacity)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.shadowOpacity = value;
            void this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Caption size")
      .setDesc("Adjust the size of figure captions.")
      .addSlider((slider) =>
        slider
          .setLimits(0.7, 1.4, 0.05)
          .setValue(this.plugin.settings.captionSize)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.captionSize = value;
            void this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Figure spacing")
      .setDesc("Set the vertical space around each figure.")
      .addSlider((slider) =>
        slider
          .setLimits(0, 4, 0.1)
          .setValue(this.plugin.settings.figureSpacing)
          .setDynamicTooltip()
          .onChange((value) => {
            this.plugin.settings.figureSpacing = value;
            void this.plugin.saveSettings();
          }),
      );
  }
}