import { CookLang, Recipe } from './cooklang'
import { TextFileView, setIcon, TFile, Keymap, WorkspaceLeaf } from 'obsidian'

// This is the custom view
export class CookView extends TextFileView {
  viewEl: HTMLElement;
  previewEl: HTMLElement;
  sourceEl: HTMLElement;
  editorEl: HTMLTextAreaElement;
  editor: CodeMirror.Editor;
  recipe: Recipe;
  changeModeButton: HTMLElement;
  currentView: 'source' | 'preview';

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    // Get View Container Element
    this.viewEl = this.containerEl.getElementsByClassName('view-content')[0] as HTMLElement;
    // Add Preview Mode Container
    this.previewEl = this.viewEl.createDiv({ cls: 'cook-preview-view', attr: { 'style': 'display: none' } });
    // Add Source Mode Container
    this.sourceEl = this.viewEl.createDiv({ cls: 'cook-source-view', attr: { 'style': 'display: block' } });
    // Add container for CodeMirror editor
    this.editorEl = this.sourceEl.createEl('textarea', { cls: 'cook-cm-editor' });
    // Create CodeMirror Editor with specific config
    this.editor = CodeMirror.fromTextArea(this.editorEl, {
      lineNumbers: false,
      lineWrapping: true,
      scrollbarStyle: null,
      keyMap: "default",
      theme: "obsidian"
    });
  }

  onload() {
    // Save file on change
    this.editor.on('change', () => {
      this.requestSave();
    });

    // add the action to switch between source and preview mode
    this.changeModeButton = this.addAction('lines-of-text', 'Preview (Ctrl+Click to open in new pane)', (evt) => this.switchMode(evt), 17);

    // undocumented: Get the current default view mode to switch to
    let defaultViewMode = (this.app.vault as any).config.defaultViewMode || 'source';
    this.switchMode(null, defaultViewMode);
  }

  // function to switch between source and preview mode
  switchMode(evt?: MouseEvent, force?: 'source' | 'preview') {
    let mode = force;
    // if force mode not provided, switch to opposite of current mode
    if (!mode) mode = this.currentView === 'source' ? 'preview' : 'source';

    // if we held ctrl/cmd or middle clicked, open in new pane
    if (evt && Keymap.isModEvent(evt)) {
      this.app.workspace.duplicateLeaf(this.leaf).then(() => {
        const cookLeaf = this.app.workspace.activeLeaf.view as CookView;
        cookLeaf.currentView = this.currentView;
        cookLeaf.switchMode(null, mode);
      });
    }
    else {
      // switch to preview mode
      if (mode === 'preview') {
        this.currentView = 'preview';
        setIcon(this.changeModeButton, 'pencil');
        this.changeModeButton.setAttribute('aria-label', 'Edit (Ctrl+Click to edit in new pane)');

        this.renderPreview(this.recipe);
        this.previewEl.style.setProperty('display', 'block');
        this.sourceEl.style.setProperty('display', 'none');
      }
      // switch to source mode
      else {
        this.currentView = 'source';
        setIcon(this.changeModeButton, 'lines-of-text');
        this.changeModeButton.setAttribute('aria-label', 'Preview (Ctrl+Click to open in new pane)');

        this.previewEl.style.setProperty('display', 'none');
        this.sourceEl.style.setProperty('display', 'block');
        this.editor.refresh();
      }
    }
  }

  // get the data for save
  getViewData() {
    this.data = this.editor.getValue();
    // may as well parse the recipe while we're here.
    this.recipe = CookLang.parse(this.data);
    return this.data;
  }

  // load the data into the view
  async setViewData(data: string, clear: boolean) {
    this.data = data;

    if (clear) {
      this.editor.swapDoc(CodeMirror.Doc(data, "text/x-cook"))
      this.editor.clearHistory();
    }

    this.editor.setValue(data);
    this.recipe = CookLang.parse(data);
    // if we're in preview view, also render that
    if (this.currentView === 'preview') this.renderPreview(this.recipe);
  }

  // clear the editor, etc
  clear() {
    this.previewEl.empty();
    this.editor.setValue('');
    this.editor.clearHistory();
    this.recipe = new Recipe();
    this.data = null;
  }

  getDisplayText() {
    if (this.file) return this.file.basename;
    else return "Cooklang (no file)";
  }

  canAcceptExtension(extension: string) {
    return extension == 'cook';
  }

  getViewType() {
    return "cook";
  }

  // when the view is resized, refresh CodeMirror (thanks Licat!)
  onResize() {
    this.editor.refresh();
  }

  // icon for the view
  getIcon() {
    return "document-cook";
  }

  // render the preview view
  renderPreview(recipe: Recipe) {

    // clear the preview before adding the rest
    this.previewEl.innerHTML = '';

    // we can't render what we don't have...
    if (!recipe) return;

    // add any files following the cooklang conventions to the recipe object
    // https://cooklang.org/docs/spec/#adding-pictures
    const otherFiles: TFile[] = this.file.parent.children.filter(f => (f instanceof TFile) && (f.basename == this.file.basename || f.basename.startsWith(this.file.basename + '.')) && f.name != this.file.name) as TFile[];
    otherFiles.forEach(f => {
      // convention specifies JPEGs and PNGs. Added GIFs as well. Why not?
      if (f.extension == "jpg" || f.extension == "jpeg" || f.extension == "png" || f.extension == "gif") {
        // main recipe image
        if (f.basename == this.file.basename) recipe.image = f;
        else {
          const split = f.basename.split('.');
          // individual step images
          if (split.length == 2 && parseInt(split[1])) {
            recipe.methodImages.set(parseInt(split[1]), f);
          }
        }
      }
    })

    // if there is a main image, put it as a banner image at the top
    if (recipe.image) {
      const img = createEl('img');
      img.addClass('main-image');
      img.src = this.app.vault.getResourcePath(recipe.image);
      this.previewEl.appendChild(img);
    }

    // Add the Ingredients header
    const hi = createEl('h2');
    hi.innerText = "Ingredients";
    hi.addClass('ingredients-header')
    this.previewEl.appendChild(hi);

    // Add the ingredients list
    const iul = createEl('ul');
    iul.addClass('ingredients');
    recipe.ingredients.forEach(ingredient => {
      const ili = createEl('li');
      if (ingredient.amount !== null) {
        const span = createEl('span');
        span.addClass('amount');
        span.innerText = ingredient.amount;
        ili.appendChild(span);
        ili.appendText(' ');
      }
      if (ingredient.unit !== null) {
        const span = createEl('span');
        span.addClass('unit');
        span.innerText = ingredient.unit;
        ili.appendChild(span);
        ili.appendText(' ');
      }

      ili.appendText(ingredient.name);
      iul.appendChild(ili);
    })
    this.previewEl.appendChild(iul);

    // add the method header
    const hm = createEl('h2');
    hm.innerText = "Method";
    hm.addClass('method-header');
    this.previewEl.appendChild(hm);

    // add the method list
    const mol = createEl('ol');
    mol.addClass('method');
    let i = 1;
    recipe.method.forEach(line => {
      const mli = createEl('li');
      mli.innerHTML = line;
      if (recipe.methodImages.has(i)) {
        const img = createEl('img');
        img.addClass('method-image');
        img.src = this.app.vault.getResourcePath(recipe.methodImages.get(i));
        mli.append(img);
      }
      i++;
      mol.appendChild(mli);
    });
    this.previewEl.appendChild(mol);
  }
}