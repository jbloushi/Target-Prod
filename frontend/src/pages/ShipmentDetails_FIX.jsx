import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import styled from 'styled-components';
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api';
import { useShipment } from '../context/ShipmentContext';
import { useAuth } from '../context/AuthContext';
import { useSnackbar } from 'notistack';
import {
    PageHeader,
    Button,
    StatusPill,
    Loader,
    Alert,
    Tabs,
    Tab
} from '../ui';
import {
    Drawer,
    Typography,
    Stack,
    Box,
    Divider,
    TextField,
    Chip,
    Grid,
    IconButton as MuiIconButton
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import UpdateIcon from '@mui/icons-material/Update';
import EditIcon from '@mui/icons-material/Edit';
import SaveIcon from '@mui/icons-material/Save';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ShareIcon from '@mui/icons-material/Share';
import TrackingTimeline from '../components/TrackingTimeline';
import AddressPanel from '../components/AddressPanel';
import ShipmentContent from '../components/shipment/ShipmentContent';
import ShipmentBilling from '../components/shipment/ShipmentBilling';
import { financeService, shipmentService, userService, BACKEND_URL } from '../services/api';
import api from '../services/api'; // Use the default api instance for generic get requests

// ... rest of the styles and component logic ...
// I will rewrite the whole file to ensure it's correct.
// wait, the file is 1600 lines. write_to_file is risky for huge files if I don't have the whole content.
// I have most of it, but I should use multi_replace_file_content or replace_file_content correctly.
