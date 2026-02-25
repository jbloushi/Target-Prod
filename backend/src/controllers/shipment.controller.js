/**
 * Shipment Controller — Barrel Re-export
 *
 * The monolithic controller has been decomposed into focused sub-controllers.
 * This file re-exports everything so existing imports continue to work
 * unchanged (e.g. `require('./shipment.controller')`).
 *
 * Sub-controllers:
 *   shipment-crud.controller     — CRUD operations
 *   shipment-booking.controller  — Quoting, carriers, booking
 *   shipment-tracking.controller — Location, history, ETA, distance
 *   shipment-checkpoint.controller — Checkpoint management
 *   shipment-public.controller   — Unauthenticated tracking & receiver updates
 *   shipment-ops.controller      — Status, labels, driver pickup, warehouse scan
 */

const crud = require('./shipment-crud.controller');
const booking = require('./shipment-booking.controller');
const tracking = require('./shipment-tracking.controller');
const checkpoint = require('./shipment-checkpoint.controller');
const public_ = require('./shipment-public.controller');
const ops = require('./shipment-ops.controller');

module.exports = {
  // CRUD
  createShipment: crud.createShipment,
  getShipmentByTrackingNumber: crud.getShipmentByTrackingNumber,
  getAllShipments: crud.getAllShipments,
  deleteShipment: crud.deleteShipment,
  updateShipment: crud.updateShipment,
  getShipmentStats: crud.getShipmentStats,

  // Booking
  getQuotes: booking.getQuotes,
  getAvailableCarriers: booking.getAvailableCarriers,
  getBookingOptions: booking.getBookingOptions,
  bookWithCarrier: booking.bookWithCarrier,
  submitToDhl: booking.submitToDhl,

  // Tracking
  updateShipmentLocation: tracking.updateShipmentLocation,
  updateShipmentLocationManually: tracking.updateShipmentLocationManually,
  getShipmentHistory: tracking.getShipmentHistory,
  getShipmentETA: tracking.getShipmentETA,
  getShipmentRouteDistance: tracking.getShipmentRouteDistance,
  getNearbyShipments: tracking.getNearbyShipments,

  // Checkpoints
  addCheckpoint: checkpoint.addCheckpoint,
  updateCheckpoint: checkpoint.updateCheckpoint,
  deleteCheckpoint: checkpoint.deleteCheckpoint,

  // Public
  getPublicShipment: public_.getPublicShipment,
  updatePublicLocation: public_.updatePublicLocation,
  updatePublicSettings: public_.updatePublicSettings,

  // Ops
  updateShipmentStatus: ops.updateShipmentStatus,
  generateLabel: ops.generateLabel,
  pickupShipment: ops.pickupShipment,
  processWarehouseScan: ops.processWarehouseScan,
  serveDocument: ops.serveDocument,
};
