import React from 'react';
import { Container, Button, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ConstructionIcon from '@mui/icons-material/Construction';
import PageHeader from '../components/common/PageHeader';
import EmptyState from '../components/common/EmptyState';

const InConstructionPage = ({ title = "Under Construction", description = "We are working hard to bring this feature to life." }) => {
    const navigate = useNavigate();

    return (
        <Container maxWidth="xl" sx={{ py: 4 }}>
            <PageHeader
                title={title}
                description="This module is currently in development."
                breadcrumbs={[
                    { label: 'Dashboard', href: '/' },
                    { label: title, href: '#' }
                ]}
            />

            <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                <EmptyState
                    title="Coming Soon"
                    description={description}
                    icon={<ConstructionIcon />}
                    action={
                        <Button variant="contained" onClick={() => navigate('/')}>
                            Return to Dashboard
                        </Button>
                    }
                />
            </Box>
        </Container>
    );
};

export default InConstructionPage;
