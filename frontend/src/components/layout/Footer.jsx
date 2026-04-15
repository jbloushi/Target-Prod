import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Container,
  Grid,
  Link,
  Typography,
  Divider,
  IconButton,
} from '@mui/material';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import FacebookIcon from '@mui/icons-material/Facebook';
import TwitterIcon from '@mui/icons-material/Twitter';
import LinkedInIcon from '@mui/icons-material/LinkedIn';
import InstagramIcon from '@mui/icons-material/Instagram';

const Footer = ({ compact = false }) => {
  const currentYear = new Date().getFullYear();

  return (
    <Box
      component="footer"
      sx={{
        bgcolor: '#ffffff',
        py: compact ? 3 : 6,
        mt: 'auto',
      }}
    >
      <Container maxWidth="lg">
        {compact ? (
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <LocalShippingIcon sx={{ color: '#0050d4' }} />
              <Typography variant="subtitle1" color="text.primary" fontWeight="bold" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                TARGET<Box component="span" sx={{ color: '#0050d4' }}> LOGISTICS</Box>
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
              {['Track', 'Contact', 'Privacy', 'Terms'].map((item) => (
                <Link
                  key={item}
                  component={RouterLink}
                  to={`/${item.toLowerCase()}`}
                  color="text.secondary"
                  sx={{ textDecoration: 'none', fontSize: '0.85rem', fontFamily: 'Manrope, sans-serif' }}
                >
                  {item}
                </Link>
              ))}
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'Manrope, sans-serif' }}>
              © {currentYear} Target Logistics
            </Typography>
          </Box>
        ) : (
          <>
            <Grid container spacing={4}>
              <Grid item xs={12} md={4}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                  <LocalShippingIcon sx={{ mr: 1, color: '#0050d4' }} />
                  <Typography variant="h6" color="text.primary" fontWeight="bold" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                    TARGET<Box component="span" sx={{ color: '#0050d4' }}> LOGISTICS</Box>
                  </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph sx={{ fontFamily: 'Manrope, sans-serif' }}>
                  Track your shipments in real-time with our advanced tracking system.
                  We provide reliable and fast shipping services worldwide.
                </Typography>
                <Box sx={{ mt: 2 }}>
                  <IconButton sx={{ color: '#0050d4' }} aria-label="Facebook">
                    <FacebookIcon />
                  </IconButton>
                  <IconButton sx={{ color: '#0050d4' }} aria-label="Twitter">
                    <TwitterIcon />
                  </IconButton>
                  <IconButton sx={{ color: '#0050d4' }} aria-label="LinkedIn">
                    <LinkedInIcon />
                  </IconButton>
                  <IconButton sx={{ color: '#0050d4' }} aria-label="Instagram">
                    <InstagramIcon />
                  </IconButton>
                </Box>
              </Grid>
              
              <Grid item xs={6} md={2}>
                <Typography variant="subtitle1" color="text.primary" gutterBottom fontWeight="bold" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                  Navigation
                </Typography>
                <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
                  {['Home', 'Track'].map((item) => (
                    <Box component="li" key={item} sx={{ py: 0.5 }}>
                      <Link
                        component={RouterLink}
                        to={item === 'Home' ? '/' : `/${item.toLowerCase().replace(' ', '-')}`}
                        color="text.secondary"
                        sx={{ 
                          textDecoration: 'none',
                          fontFamily: 'Manrope, sans-serif',
                          '&:hover': { color: '#0050d4' }
                        }}
                      >
                        {item}
                      </Link>
                    </Box>
                  ))}
                </Box>
              </Grid>
              
              <Grid item xs={6} md={2}>
                <Typography variant="subtitle1" color="text.primary" gutterBottom fontWeight="bold" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                  Company
                </Typography>
                <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
                  {['About', 'Contact', 'Careers', 'Blog'].map((item) => (
                    <Box component="li" key={item} sx={{ py: 0.5 }}>
                      <Link
                        component={RouterLink}
                        to={`/${item.toLowerCase()}`}
                        color="text.secondary"
                        sx={{ 
                          textDecoration: 'none',
                          fontFamily: 'Manrope, sans-serif',
                          '&:hover': { color: '#0050d4' }
                        }}
                      >
                        {item}
                      </Link>
                    </Box>
                  ))}
                </Box>
              </Grid>
              
              <Grid item xs={6} md={2}>
                <Typography variant="subtitle1" color="text.primary" gutterBottom fontWeight="bold" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                  Legal
                </Typography>
                <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
                  {['Privacy', 'Terms', 'Cookies', 'FAQ'].map((item) => (
                    <Box component="li" key={item} sx={{ py: 0.5 }}>
                      <Link
                        component={RouterLink}
                        to={`/${item.toLowerCase()}`}
                        color="text.secondary"
                        sx={{ 
                          textDecoration: 'none',
                          fontFamily: 'Manrope, sans-serif',
                          '&:hover': { color: '#0050d4' }
                        }}
                      >
                        {item}
                      </Link>
                    </Box>
                  ))}
                </Box>
              </Grid>
              
              <Grid item xs={6} md={2}>
                <Typography variant="subtitle1" color="text.primary" gutterBottom fontWeight="bold" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                  Support
                </Typography>
                <Box component="ul" sx={{ p: 0, m: 0, listStyle: 'none' }}>
                  {['Help Center', 'Contact Support', 'Report Issue'].map((item) => (
                    <Box component="li" key={item} sx={{ py: 0.5 }}>
                      <Link
                        component={RouterLink}
                        to="/contact"
                        color="text.secondary"
                        sx={{ 
                          textDecoration: 'none',
                          fontFamily: 'Manrope, sans-serif',
                          '&:hover': { color: '#0050d4' }
                        }}
                      >
                        {item}
                      </Link>
                    </Box>
                  ))}
                </Box>
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 4, borderColor: 'rgba(169, 174, 177, 0.15)' }} />
            
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary" sx={{ fontFamily: 'Manrope, sans-serif' }}>
                © {currentYear} Target Logistics. All rights reserved.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, mt: { xs: 2, sm: 0 } }}>
                <Link component={RouterLink} to="/privacy" color="text.secondary" sx={{ textDecoration: 'none', fontFamily: 'Manrope, sans-serif' }}>
                  Privacy
                </Link>
                <Link component={RouterLink} to="/terms" color="text.secondary" sx={{ textDecoration: 'none', fontFamily: 'Manrope, sans-serif' }}>
                  Terms
                </Link>
                <Link component={RouterLink} to="/cookies" color="text.secondary" sx={{ textDecoration: 'none', fontFamily: 'Manrope, sans-serif' }}>
                  Cookies
                </Link>
              </Box>
            </Box>
          </>
        )}
      </Container>
    </Box>
  );
};

export default Footer;
