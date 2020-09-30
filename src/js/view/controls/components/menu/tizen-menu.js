import Menu from 'view/controls/components/menu/menu';
import { selectMenuItem, destroyMenu } from './utils';
import { USER_ACTION } from 'events/events';
import UI from 'utils/ui';
import { 
    nextSibling, 
    previousSibling,
} from 'utils/dom';
import { TizenMenuTemplate, TizenSubmenuTemplate } from 'view/controls/templates/menu/menu';

export class TizenMenu extends Menu {
    constructor(api, model, controlbar, localization) {
        super('settings', localization.settings, null, localization, TizenMenuTemplate);
        this.onInteraction = this.onInteraction.bind(this);
        this.api = api;
        this.model = model;
        this.localization = localization;
        this.visible = false;
        this.ui = new UI(this.el);
        this.onTransition = onTransition.bind(this);
        this.controlbar = controlbar;
        this.addEventListeners();
    }

    addEventListeners() {
        const { model } = this;

        this.on('visibility', this.setVisibility, this);
        this.on('menuAppended', this.updateControlbarButtons());

        model.on('change:playlistItem', this.onPlaylistItem, this);
        model.change('audioTracks', this.onAudioTracks, this);
        model.on('change:currentAudioTrack', this.onAudioTrackIndex, this);
        model.change('captionsList', this.onCaptionsList, this);
        model.change('captionsIndex', this.onCaptionsIndex, this);

        this.el.addEventListener('animationend', this.onTransition);
    }

    setupMenu(menuName, menuTitle, items, onItemSelect, defaultItemIndex, itemOptions) {
        if (!items || items.length <= 1) {
            this.removeMenu(menuName);
            return;
        }
        let menu = this.children[menuName];
    
    
        if (!menu) {
            // We pass null as parent menu to avoid using the standard menu HTML heirarchy.
            menu = new Menu(menuName, menuTitle, null, this.localization, TizenSubmenuTemplate);
            menu.parentMenu = this;
            menu.itemsContainer = new UI(menu.el.querySelector('.jw-settings-submenu-items'));
            const noop = () => {};
            // replace open, close and toggle with noops. Submenus always visible in Tizen.
            menu.open = menu.close = menu.toggle = noop;
            menu.el.classList.add('jw-settings-submenu-active');
            // add tizen control listener
            this.appendMenu(menu);
        }

        menu.setMenuItems(
            menu.createItems(items, onItemSelect, itemOptions), 
            defaultItemIndex
        );
    }
    
    onInteraction(evt) {
        const onNavigateMenu = (isUp) => {
            const next = isUp ? previousSibling(evt.target) : nextSibling(evt.target);
            if (next) {
                next.focus({ preventScroll: true });
            } else {
                const nextMenu = isUp ? this.children.audioTracks : this.children.captions;
                const isMenuNext = nextMenu.el.contains(evt.target);
                if (isMenuNext && nextMenu) {
                    const items = nextMenu.items;
                    items[items.length - 1].el.focus({ preventScroll: true });
                }
            }
            this.trigger(USER_ACTION);
        };

        switch (evt.keyCode) {
            case 38: // Up
                onNavigateMenu(true);
                break;
            case 40: // Down
                onNavigateMenu(false);
                break;
            case 37: // Left
                this.close();
                if (this.controlbar) {
                    this.controlbar.elements.settingsButton.element().focus();
                }
                break;
            case 415: // Play
            case 10252: // Play/Pause
                this.close(evt, true);
                this.api.play({ reason: 'settingsInteraction' });
                break;
            case 10009: // Back
                this.close(evt);
                break;
            default:
                break;
        }
    }

    setVisibility(evt) {
        const el = this.el;
        
        if (evt.visible) {
            this.api.pause({ reason: 'settingsInteraction' });
            document.addEventListener('keydown', this.onInteraction);
            el.classList.remove('jw-settings-transition-close');
            el.classList.add('jw-settings-open');
            el.classList.add('jw-settings-transition-open');
            el.setAttribute('aria-expanded', 'true');
            this.visible = true;
            const menuNames = Object.keys(this.children);
            if (this.children && menuNames.length) {
                // Focus first item of first menu
                this.children[menuNames[0]].items[0].el.focus({ preventScroll: true });
            }
        } else {
            document.removeEventListener('keydown', this.onInteraction);
            el.classList.remove('jw-settings-transition-open');
            el.classList.add('jw-settings-transition-close');
            el.setAttribute('aria-expanded', 'false');
            this.visible = false;
        }

        if (this.controlbar) {
            // Hide controlbar when showing menu
            this.controlbar.toggleVisibility(!evt.visible);
        }
    }

    open(evt) {
        if (this.visible) {
            return;
        }
        this.trigger('visibility', { visible: true, evt });
    }

    close(evt) {
        if (!this.visible) {
            return;
        }
        this.trigger('visibility', { visible: false, evt });
    }

    toggle(evt) {
        this.trigger('visibility', { visible: !this.visible, evt });
    }

    onCaptionsList(model, captionsList) {
        const menuItemOptions = { defaultText: this.localization.off };
        const initialIndex = model.get('captionsIndex');
        
        this.setupMenu(
            'captions',
            this.localization.cc,
            captionsList, 
            (index) => this.api.setCurrentCaptions(index), 
            initialIndex, 
            menuItemOptions
        );
    }

    onCaptionsIndex(model, index) {
        const captionsMenu = this.children.captions;
        if (captionsMenu) {
            selectMenuItem(captionsMenu, index);
        }
    }

    onAudioTracks(model, audioTracks) {
        this.setupMenu(
            'audioTracks', 
            this.localization.audioTracks,
            audioTracks, 
            (index) => this.api.setCurrentAudioTrack(index), 
            model.get('currentAudioTrackIndex')
        );
    }

    onAudioTrackIndex(model, trackIndex) {
        const audioTracksMenu = this.children.audioTracks;
        if (!audioTracksMenu) {
            return;
        }
        selectMenuItem(audioTracksMenu, trackIndex);
    }

    onPlaylistItem() {
        // Settings menu should not be visible when switching playlist items via controls or .load()
        if (this.visible) {
            this.close();
        }
        if (this.children && this.children.length) {
            this.children.forEach(child => {
                this.removeChild(child);
            });
        }
    }

    destroy() {
        destroyMenu.call(this);
        this.el.removeEventListener('animationend', this.onTransition);
        document.removeEventListener('keydown', this.onInteraction);

        if (this.controlbar) {
            this.controlbar.toggleVisibility(true);
        }
    }

    updateControlbarButtons() {
        if (!Object.keys(this.children)) {
            this.controlbar.elements.settingsButton.hide();
        } else {
            this.controlbar.elements.settingsButton.show();
        }
    }
}

function onTransition() {
    if (!this.visible) {
        this.el.classList.remove('jw-settings-transition-open', 'jw-settings-open');
    }
}
