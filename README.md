# Obsidian figure numbers plugin
This plugin adds figure numbers to your figures as well as figure captions and custom styling.

## Installation guide
Check if you have node js and npm installed. If not, make sure to download it.
```
node --version
npm --version
```

To install node js and npm use the following commands. If you already have this installed, skip this step.

```
sudo apt install nodejs
sudo apt install npm
```

To build the plugin, first install the following packages.
```
npm install --save-dev obsidian esbuild typescript @types/node

npm install --save-dev @codemirror/state @codemirror/view @codemirror/language
```

We first have to export the vault path so we can build the plugin into our own vault.
```
export OBSIDIAN_VAULT="PATH_TO_VAULT"
```

To check if you correctly added the path to you vault, use: 
```
echo "$OBSIDIAN_VAULT"
```

If the correct path is added, make sure to run the following commands:
```
cd /obsidian-figure-captions
npm run build
```
You should then see the plugin appear in the community plugins tab in obsidian.

## Using the plugin
The plugin is very simple. You can just add the following markdown in you document.

```
![caption](Image.png)
```


## Settings

Open **Settings → Community plugins → Figure Captions** to customize:

- Image corner radius
- Image shadow visibility, softness, and opacity
- Caption size
- Spacing around figures

Changes are saved automatically and apply to both Live Preview and Reading View.
