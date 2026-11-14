/**
 * The definition-independent parts of custom portals (ADR 0077 D2, D5, D6; B333): {@link
 * dev.mcsupermods.runtime.registry.portal.PortalFrame} (the frame rule, written from ADR 0077 D2, never from vanilla's
 * {@code PortalShape}), {@link dev.mcsupermods.runtime.registry.portal.PortalIndex} and {@link
 * dev.mcsupermods.runtime.registry.portal.PortalIndexAttachment} (the per-level index {@code msm_runtime:portals} that
 * replaces POI types), {@link dev.mcsupermods.runtime.registry.portal.ExitPortals} (finding or building an exit,
 * never vanilla's {@code PortalForcer}), and {@link dev.mcsupermods.runtime.registry.portal.PortalLighting} (D3: the igniter
 * callback and the {@code light_portal} action; B334). The portal block (B334) and travel (B336) wire them to a definition. Nothing here
 * touches {@code PoiTypes}, {@code PoiManager}, {@code PortalForcer} or {@code ServerLevel.getPortalForcer}.
 */
package dev.mcsupermods.runtime.registry.portal;
