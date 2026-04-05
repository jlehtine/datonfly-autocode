/**
 * Extension hook contracts.
 *
 * Typed registration descriptors for the points a vendor base application
 * exposes and that generated code extends — menus, routes/views, panels,
 * widgets, and data sources. This is the surface the codegen agent generates
 * against. Descriptors are stack-neutral metadata; the concrete component or
 * handler each descriptor refers to is provided by the application stack.
 */

/** Version of the extension hook contract. Bump on any breaking change. */
export const HOOK_CONTRACT_VERSION = "1.0.0";

/** The kind of extension point a descriptor registers against. */
export type ExtensionHookKind = "menu" | "route" | "panel" | "widget" | "data-source";

/** Runtime constant mapping each {@link ExtensionHookKind} to itself. */
export const EXTENSION_HOOK_KINDS = {
    menu: "menu",
    route: "route",
    panel: "panel",
    widget: "widget",
    "data-source": "data-source",
} as const satisfies Record<ExtensionHookKind, ExtensionHookKind>;

/** Fields shared by every extension hook descriptor. */
export interface ExtensionHookBase {
    /** Discriminator identifying the hook kind. */
    kind: ExtensionHookKind;
    /** Stable, unique identifier of the registration within its application. */
    id: string;
    /** Identifier of the stack component/handler that implements the hook. */
    componentRef: string;
}

/** Registers an item into an application navigation menu. */
export interface MenuHook extends ExtensionHookBase {
    kind: "menu";
    /** Human-readable label for the menu item. */
    label: string;
    /** Identifier of the parent menu to insert into. */
    parentMenuId: string;
    /** Sort order within the parent menu (ascending). */
    order?: number | undefined;
    /** Optional icon identifier from the stack's icon set. */
    icon?: string | undefined;
}

/** Registers a routable view at a path within the application. */
export interface RouteHook extends ExtensionHookBase {
    kind: "route";
    /** URL path pattern the view is mounted at. */
    path: string;
    /** Human-readable title of the view. */
    title: string;
}

/** Registers a panel into a named region of an existing view. */
export interface PanelHook extends ExtensionHookBase {
    kind: "panel";
    /** Identifier of the region the panel is placed in. */
    regionId: string;
    /** Sort order within the region (ascending). */
    order?: number | undefined;
}

/** Registers a self-contained widget that can be placed on a dashboard. */
export interface WidgetHook extends ExtensionHookBase {
    kind: "widget";
    /** Human-readable title of the widget. */
    title: string;
}

/** Registers a named data source the application can bind to. */
export interface DataSourceHook extends ExtensionHookBase {
    kind: "data-source";
    /** Logical name other registrations reference this data source by. */
    name: string;
}

/** Discriminated union of all extension hook descriptors. */
export type ExtensionHook = MenuHook | RouteHook | PanelHook | WidgetHook | DataSourceHook;
