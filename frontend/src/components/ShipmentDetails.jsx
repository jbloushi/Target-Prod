import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import TrackingTimeline from './TrackingTimeline';
import { useTheme, alpha } from '@mui/material/styles';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  LinearProgress,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  IconButton,
  Grid,
  Autocomplete,
  CircularProgress,
  Tabs,
  Tab,
  Paper,
  Divider,
  Stack,
  Alert
} from '@mui/material';

// Icons
import {
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  LocationOn as LocationIcon,
  Assignment as AssignmentIcon,
  Inventory as InventoryIcon,
  Info as InfoIcon,
  Error as ErrorIcon,
  Edit as EditIcon,
  LocalShipping as TruckIcon,
  MyLocation as MyLocationIcon,
  Search as SearchIcon,
  Public as PublicIcon,
  Share as ShareIcon,
  Delete as DeleteIcon,
  Print as PrintIcon,
  Description as DescriptionIcon,
  Timeline as TimelineIcon,
  Person as PersonIcon,
  AttachMoney as AttachMoneyIcon,
  Upload as UploadIcon
} from '@mui/icons-material';

import { useShipment } from '../context/ShipmentContext';
import { useAuth } from '../context/AuthContext';
import {
  buildShipmentDeleteBlockedMessage,
  canDeleteShipmentStatus,
  getShipmentDeleteErrorMessage
} from '../utils/shipmentDeletionPolicy';
import axios from 'axios';
import LocationPicker from './LocationPicker';


// --- Constants & Helpers ---

const countries = [
  { code: 'KW', name: 'Kuwait', flag: '🇰🇼' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'QA', name: 'Qatar', flag: '🇶🇦' },
  { code: 'BH', name: 'Bahrain', flag: '🇧🇭' },
  { code: 'OM', name: 'Oman', flag: '🇴🇲' },
  // ... (Add more if needed, or keeping it short for brevity in rewrite)
];

const statusIcons = {
  draft: <ScheduleIcon />,
  pending: <ScheduleIcon />,
  booked: <InventoryIcon />,
  updated: <ScheduleIcon />,
  created: <InventoryIcon />,
  ready_for_pickup: <InventoryIcon />,
  picked_up: <TruckIcon />,
  in_transit: <TruckIcon />,
  out_for_delivery: <TruckIcon />,
  delivered: <CheckCircleIcon />,
  exception: <ErrorIcon />,
  cancelled: <ErrorIcon />,
};

const statusColors = {
  draft: 'default',
  pending: 'warning',
  booked: 'info',
  updated: 'warning',
  created: 'info',
  ready_for_pickup: 'warning',
  picked_up: 'info',
  in_transit: 'primary',
  out_for_delivery: 'warning',
  delivered: 'success',
  exception: 'error',
  cancelled: 'error',
};

const manualStatusOptions = [
  'draft',
  'pending',
  'booked',
  'ready_for_pickup',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception',
  'cancelled',
];

const formatStatus = (status) => {
  if (!status) return '';
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// --- Sub-Components ---

const InfoRow = ({ label, value, icon }) => (
  <Box display="flex" alignItems="center" mb={1.5}>
    {icon && <Box color="text.secondary" mr={1.5} display="flex">{icon}</Box>}
    <Box>
      <Typography variant="caption" color="text.secondary" display="block" lineHeight={1}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight="500">
        {value || 'N/A'}
      </Typography>
    </Box>
  </Box>
);

const AddressBlock = ({ title, data }) => (
  <Card variant="outlined" sx={{
    height: '100%',
    borderRadius: 3,
    bgcolor: '#141929',
    borderColor: '#2a3347',
    transition: 'all 0.2s',
    '&:hover': {
      borderColor: 'primary.main',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
    }
  }}>
    <CardContent>
      <Box display="flex" alignItems="center" gap={1} mb={2}>
        <LocationIcon color="primary" fontSize="small" />
        <Typography variant="subtitle2" color="primary" textTransform="uppercase" letterSpacing={1} fontWeight="700">
          {title}
        </Typography>
      </Box>
      <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ color: '#fff' }}>
        {data?.contactPerson || data?.name || 'N/A'}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {data?.company}
      </Typography>

      <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
        <Typography variant="body2" fontWeight="500" color="#e2e8f0" sx={{ lineHeight: 1.6 }}>
          {data?.formattedAddress || data?.address}
        </Typography>
        {data?.city && <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>{data.city}, {data.country}</Typography>}
      </Box>

      {(data?.phone || data?.email) && (
        <Box mt={2}>
          {data.phone && <Typography variant="caption" display="block" color="text.secondary">📞 {data.phone}</Typography>}
          {data.email && <Typography variant="caption" display="block" color="text.secondary">✉️ {data.email}</Typography>}
        </Box>
      )}
    </CardContent>
  </Card>
);


// --- Main Component ---

const ShipmentDetails = ({ shipment, onUpdateLocation, updatingLocation, locationError }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    updateShipmentStatus,
    updateLocationManually,
    deleteShipment,
    getRouteDistance,
    getShipment
  } = useShipment();

  // Role Logic
  const role = user?.role || 'public';
  const isClient = role === 'client';
  const isDriver = role === 'driver';
  const isStaff = ['staff', 'admin'].includes(role);
  const isOwner = shipment?.user === user?._id || shipment?.user?._id === user?._id;
  const canEdit = isStaff || (isClient && ['draft', 'pending', 'exception', 'updated', 'ready_for_pickup'].includes(shipment.status));

  // Tab State
  const [activeTab, setActiveTab] = useState(0);

  // Dialog States
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogData, setStatusDialogData] = useState({ status: '', description: '' });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const [manualLocationDialogOpen, setManualLocationDialogOpen] = useState(false);
  const [manualLocationData, setManualLocationData] = useState({
    coordinates: [0, 0],
    address: '',
    status: '',
    description: ''
  });
  const [updatingManualLocation, setUpdatingManualLocation] = useState(false);

  // Maps/Address States
  const [addressInput, setAddressInput] = useState('');
  const [addressOptions, setAddressOptions] = useState([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);



  // --- Handlers ---

  const handleStatusUpdate = async () => {
    try {
      setUpdatingStatus(true);
      await updateShipmentStatus(shipment.trackingNumber, {
        status: statusDialogData.status,
        description: statusDialogData.description
      });
      setStatusDialogOpen(false);
      // Refresh? Context usually handles it.
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleManualLocationUpdateAction = async () => {
    try {
      setUpdatingManualLocation(true);
      await updateLocationManually(shipment.trackingNumber, manualLocationData);
      setManualLocationDialogOpen(false);
      if (getShipment) getShipment(shipment.trackingNumber);
    } catch (err) {
      alert('Failed to update location: ' + err.message);
    } finally {
      setUpdatingManualLocation(false);
    }
  };

  const handleDelete = async () => {
    if (!canDeleteShipmentStatus(shipment.status)) {
      alert(buildShipmentDeleteBlockedMessage(shipment.status).medium);
      return;
    }

    if (window.confirm(`Delete shipment ${shipment.trackingNumber}? This is only allowed while the shipment is still in an early pre-processing state and cannot be undone.`)) {
      try {
        await deleteShipment(shipment.trackingNumber);
        navigate('/shipments');
      } catch (err) {
        alert(getShipmentDeleteErrorMessage(err, shipment.status, 'medium'));
      }
    }
  };


  const handleOpenPdf = (dataUrl) => {
    if (!dataUrl) return;

    // If it's an API route (like our internal HTML label generator), open it directly in a new tab.
    // The browser will render the HTML and the user can print it.
    if (dataUrl.startsWith('/api/')) {
      window.open(dataUrl, '_blank');
      return;
    }

    // Check if it's already a blob or http url
    if (dataUrl.startsWith('http') || dataUrl.startsWith('blob:')) {
      window.open(dataUrl, '_blank');
      return;
    }

    // Convert Base64 Data URI to Blob to bypass "Not allowed to navigate top frame to data URL"
    if (dataUrl.startsWith('data:')) {
      try {
        const arr = dataUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } catch (e) {
        console.error("PDF Open Error:", e);
        // Fallback (might trigger browser warning on some Chrome versions)
        window.open(dataUrl, '_blank');
      }
    } else {
      // Assume it's a raw base64 string without data: prefix
      try {
        const bstr = atob(dataUrl);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: 'application/pdf' });
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
      } catch (e) {
        console.error("PDF Open Error:", e);
        window.open(`data:application/pdf;base64,${dataUrl}`, '_blank');
      }
    }
  };

  // --- Render ---

  if (!shipment) return <CircularProgress />;

  const progress = (() => {
    if (shipment.status === 'delivered') return 100;
    // Simple Calc based on status if coords missing
    if (shipment.status === 'created') return 10;
    if (shipment.status === 'picked_up') return 30;
    if (shipment.status === 'in_transit') return 60;
    if (shipment.status === 'out_for_delivery') return 90;
    return 0;
    // (Could use geocalc but status is safer fallback)
  })();

  return (
    <Box>
      <Grid container spacing={4}>
        {/* 2. LEFT COLUMN: TABS & CONTENT (70%) */}
        <Grid item xs={12} lg={8}>

          {/* Custom Pill Tabs */}
          <Box sx={{ borderBottom: 1, borderColor: 'rgba(255,255,255,0.05)', mb: 3 }}>
            <Tabs
              value={activeTab}
              onChange={(e, v) => setActiveTab(v)}
              sx={{
                minHeight: 'auto',
                '& .MuiTabs-indicator': { display: 'none' }
              }}
            >
              {[
                {label: 'Overview', icon: <InfoIcon fontSize="small" /> },
                {label: 'Parcels', icon: <InventoryIcon fontSize="small" /> },
                {label: 'Activity', icon: <TimelineIcon fontSize="small" /> },
                ...(isStaff ? [{label: 'Management', icon: <AttachMoneyIcon fontSize="small" /> }] : [])
              ].map((tab, index) => (
              <Tab
                key={index}
                label={tab.label}
                icon={tab.icon}
                iconPosition="start"
                sx={{
                  minHeight: 'auto',
                  minWidth: 'auto',
                  py: 1,
                  px: 2.5,
                  mr: 1.5,
                  borderRadius: 50,
                  color: 'text.secondary',
                  fontWeight: 600,
                  transition: 'all 0.2s',
                  '&.Mui-selected': {
                    color: 'primary.main',
                    bgcolor: 'rgba(0, 217, 184, 0.1)',
                  },
                  '&:hover': {
                    color: 'text.primary',
                    bgcolor: 'rgba(255,255,255,0.03)'
                  }
                }}
              />
              ))}
            </Tabs>
          </Box>

          {/* TAB 0: OVERVIEW */}
          <TabPanel value={activeTab} index={0}>
            {/* Progress Bar */}
            {['in_transit', 'out_for_delivery', 'picked_up'].includes(shipment.status) && (
              <Box mb={4} sx={{ bgcolor: '#141929', p: 3, borderRadius: 3, border: '1px solid #2a3347' }}>
                <Box display="flex" justifyContent="space-between" mb={1.5}>
                  <Typography variant="caption" fontWeight="bold" color="text.secondary" textTransform="uppercase" letterSpacing={1}>Delivery Progress</Typography>
                  <Typography variant="caption" fontWeight="bold" color="primary">{progress}%</Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={progress}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    bgcolor: 'rgba(255,255,255,0.05)',
                    '& .MuiLinearProgress-bar': {
                      borderRadius: 4,
                      backgroundImage: 'linear-gradient(90deg, #00d9b8, #00b8d9)'
                    }
                  }}
                />
              </Box>
            )}

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <AddressBlock title="Origin (Sender)" data={shipment.origin} />
              </Grid>
              <Grid item xs={12} md={6}>
                <AddressBlock title="Destination (Recipient)" data={shipment.destination} />
              </Grid>
            </Grid>

            <Box mt={4}>
              <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ color: '#fff', mb: 2 }}>Shipment Details</Typography>
              <Box sx={{ bgcolor: '#141929', p: 3, borderRadius: 3, border: '1px solid #2a3347' }}>
                <Grid container spacing={2}>
                  <Grid item xs={6} md={3}>
                    <InfoRow label="Service Type" value={shipment.serviceType || 'Standard'} icon={<TruckIcon fontSize="small" sx={{ color: 'primary.main' }} />} />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <InfoRow label="Total Pieces" value={shipment.items?.length || 0} icon={<InventoryIcon fontSize="small" sx={{ color: 'primary.main' }} />} />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <InfoRow label="Total Weight" value={`${shipment.totalWeight || 0} kg`} />
                  </Grid>
                  <Grid item xs={6} md={3}>
                    <InfoRow label="Dimensions" value={shipment.items?.[0] ? `${shipment.items[0].length}x${shipment.items[0].width}x${shipment.items[0].height} cm` : 'N/A'} />
                  </Grid>
                </Grid>
              </Box>
            </Box>
          </TabPanel>

          {/* TAB 1: PARCELS */}
          <TabPanel value={activeTab} index={1}>
            <Box sx={{ bgcolor: '#141929', borderRadius: 3, border: '1px solid #2a3347', overflow: 'hidden' }}>
              <List disablePadding>
                {shipment.items?.map((item, i) => (
                  <ListItem key={i} divider sx={{ px: 3, py: 2, borderColor: 'rgba(255,255,255,0.05)' }}>
                    <ListItemIcon>
                      <Box sx={{ p: 1, bgcolor: 'rgba(0, 217, 184, 0.1)', borderRadius: 2, color: 'primary.main' }}>
                        <InventoryIcon />
                      </Box>
                    </ListItemIcon>
                    <ListItemText
                      primary={<Typography fontWeight="600" color="text.primary">{item.description}</Typography>}
                      secondary={
                        <Typography variant="body2" color="text.secondary">
                          Weight: {item.weight}kg • Dimensions: {item.length || item.dimensions?.length || 0}x{item.width || item.dimensions?.width || 0}x{item.height || item.dimensions?.height || 0}cm
                        </Typography>
                      }
                    />
                    <Chip label={`Qty: ${item.quantity}`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)', color: 'text.primary', fontWeight: 600 }} />
                  </ListItem>
                ))}
                {shipment.items?.length === 0 && <Box p={3}><Typography color="textSecondary">No items found.</Typography></Box>}
              </List>
            </Box>
          </TabPanel>

          {/* TAB 2: ACTIVITY */}
          <TabPanel value={activeTab} index={2}>
            <Box sx={{ bgcolor: '#141929', p: 3, borderRadius: 3, border: '1px solid #2a3347' }}>
              <TrackingTimeline history={shipment.history || []} currentStatus={shipment.status} />
            </Box>
          </TabPanel>

          {/* TAB 3: MANAGEMENT (Staff Only) */}
          {isStaff && (
            <TabPanel value={activeTab} index={3}>
              <Box sx={{ bgcolor: '#141929', p: 3, borderRadius: 3, border: '1px solid #2a3347' }}>
                <Grid container spacing={2} alignItems="center">
                  {/* RESTRICTED: Cost Price only visible to Admin */}
                  {user?.role === 'admin' && (
                    <Grid item xs={12} md={6}>
                      <InfoRow label="Cost Price" value={`$${shipment.costPrice || 0}`} icon={<AttachMoneyIcon color="error" />} />
                    </Grid>
                  )}
                  <Grid item xs={12} md={4}>
                    <InfoRow label="Sales Price" value={`${shipment.pricingSnapshot?.currency || 'KWD'} ${shipment.price || 0}`} icon={<AttachMoneyIcon color="success" />} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <InfoRow
                      label="Pricing Policy Source"
                      value={shipment.pricingSnapshot?.policySource?.replace('_', ' ').toUpperCase() || 'ORG DEFAULT'}
                      icon={<InfoIcon color="primary" />}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                    <Typography variant="subtitle2" gutterBottom color="text.secondary">Internal Notes</Typography>
                    <Paper variant="outlined" sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <Typography variant="body2" color="textSecondary">
                        {shipment.internalNotes || 'No internal notes found.'}
                      </Typography>
                      <Button size="small" startIcon={<EditIcon />} sx={{ mt: 1 }}>Edit Notes</Button>
                    </Paper>
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      variant="outlined"
                      startIcon={<MyLocationIcon />}
                      onClick={() => setManualLocationDialogOpen(true)}
                      sx={{ borderColor: '#2a3347', color: 'text.secondary' }}
                    >
                      Update Location Manually
                    </Button>
                  </Grid>
                </Grid>
              </Box>
            </TabPanel>
          )}
        </Grid>

        {/* 3. RIGHT COLUMN: MAP (30%) */}
        <Grid item xs={12} lg={4}>
          <Card elevation={0} sx={{
            height: 500,
            borderRadius: 3,
            border: '1px solid #2a3347',
            overflow: 'hidden',
            position: 'sticky',
            top: 24,
            bgcolor: '#141929'
          }}>
            {/* Map Overlay Info */}
            <Box sx={{ position: 'absolute', top: 16, left: 16, right: 16, zIndex: 10 }}>
              <Paper sx={{ p: 1.5, borderRadius: 2, display: 'flex', alignItems: 'center', gap: 1.5, boxShadow: 3, bgcolor: 'rgba(20, 25, 41, 0.95)', backdropFilter: 'blur(8px)', border: '1px solid #2a3347' }}>
                <Box sx={{ bgcolor: 'rgba(0, 217, 184, 0.1)', p: 1, borderRadius: '50%', color: 'primary.main' }}>
                  <LocationIcon fontSize="small" />
                </Box>
                <Box>
                  <Typography variant="caption" fontWeight="bold" color="textSecondary" display="block">CURRENT LOCATION</Typography>
                  <Typography variant="body2" fontWeight="bold" noWrap color="text.primary">
                    {shipment.currentLocation?.address || shipment.origin?.city || 'Processing Center'}
                  </Typography>
                </Box>
              </Paper>
            </Box>

            {/* The Map */}
            <Box height="100%" bgcolor="#0f121a">
              <LocationPicker
                initialLocation={{
                  coordinates: shipment.currentLocation?.coordinates || shipment.origin?.coordinates || [0, 0],
                  latitude: shipment.currentLocation?.coordinates?.[1] || shipment.origin?.coordinates?.[1] || 0,
                  longitude: shipment.currentLocation?.coordinates?.[0] || shipment.origin?.coordinates?.[0] || 0
                }}
                readonly={true}
                height="100%"
              />
            </Box>

            {/* Driver Action Overlay */}
            {isDriver && (
              <Box sx={{ position: 'absolute', bottom: 16, left: 16, right: 16, zIndex: 10 }}>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  onClick={onUpdateLocation} // Use the prop passed from TrackingPage
                  startIcon={<MyLocationIcon />}
                  sx={{ boxShadow: '0 4px 14px rgba(0, 217, 184, 0.4)' }}
                >
                  Share Live Location
                </Button>
              </Box>
            )}
          </Card>

          {/* Generated Documents Sidebar Card */}
          <Box mt={3}>
            <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ color: '#fff', mb: 2 }}>Generated Documents</Typography>
            <Card elevation={0} sx={{ borderRadius: 3, border: '1px solid #2a3347', bgcolor: '#141929' }}>
              <List disablePadding>
                {/* Reference Label - Visible to EVERYONE */}
                <ListItem button onClick={async () => {
                  const { generateWaybillPDF } = await import('../utils/pdfGenerator');
                  await generateWaybillPDF(shipment);
                }} sx={{ px: 3, py: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                  <ListItemIcon><PrintIcon color="primary" /></ListItemIcon>
                  <ListItemText
                    primary={<Typography fontWeight="600" color="text.primary">Target Label</Typography>}
                    secondary={<Typography variant="caption" color="text.secondary">System Label with QR code</Typography>}
                  />
                </ListItem>

                {/* Carrier Documents - Restricted to STAFF */}
                {isStaff && (shipment.awbUrl || shipment.invoiceUrl) && <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />}

                {(isStaff && shipment.awbUrl) && (
                  <ListItem button onClick={() => handleOpenPdf(shipment.awbUrl)} sx={{ px: 3, py: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                    <ListItemIcon><DescriptionIcon color="error" /></ListItemIcon>
                    <ListItemText
                      primary={<Typography fontWeight="600" color="text.primary">Carrier AWB</Typography>}
                      secondary={<Typography variant="caption" color="text.secondary">Official Waybill</Typography>}
                    />
                  </ListItem>
                )}

                {(isStaff && shipment.invoiceUrl) && (
                  <ListItem button onClick={() => handleOpenPdf(shipment.invoiceUrl)} sx={{ px: 3, py: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                    <ListItemIcon><AssignmentIcon color="warning" /></ListItemIcon>
                    <ListItemText
                      primary={<Typography fontWeight="600" color="text.primary">Commercial Invoice</Typography>}
                      secondary={<Typography variant="caption" color="text.secondary">Customs Declaration</Typography>}
                    />
                  </ListItem>
                )}
              </List>
            </Card>
          </Box>
        </Grid>

      </Grid>

      {/* Dialogs */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)}>
        <DialogTitle>Update Status</DialogTitle>
        <DialogContent>
          <FormControl fullWidth margin="normal">
            <InputLabel>Status</InputLabel>
            <Select
              value={statusDialogData.status}
              onChange={(e) => setStatusDialogData({ ...statusDialogData, status: e.target.value })}
            >
              {manualStatusOptions.map((status) => (
                <MenuItem key={status} value={status}>{formatStatus(status)}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            fullWidth
            margin="normal"
            label="Description"
            value={statusDialogData.description}
            onChange={(e) => setStatusDialogData({ ...statusDialogData, description: e.target.value })}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleStatusUpdate} variant="contained" disabled={updatingStatus}>Update</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={manualLocationDialogOpen} onClose={() => setManualLocationDialogOpen(false)}>
        {/* Simple Manual Location Form reuse or simplfied */}
        <DialogTitle>Update Location</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            margin="normal"
            label="Address"
            value={manualLocationData.address}
            onChange={(e) => setManualLocationData({ ...manualLocationData, address: e.target.value })}
          />
          <Typography variant="caption">Use map picker in full edit mode for precise coords.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualLocationDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleManualLocationUpdateAction} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>


    </Box>
  );
};

const TabPanel = ({ children, value, index }) => (
  <div hidden={value !== index} role="tabpanel">
    {value === index && (
      <Box sx={{ p: 3 }}>
        {children}
      </Box>
    )}
  </div>
);

export default ShipmentDetails;
