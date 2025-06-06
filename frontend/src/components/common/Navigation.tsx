import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SideNavigation } from '@cloudscape-design/components';

const Navigation: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    {
      type: 'link' as const,
      text: 'Dashboard',
      href: '/'
    },
    {
      type: 'link' as const,
      text: 'Live Demo',
      href: '/demo'
    },
    {
      type: 'link' as const,
      text: 'Cost Analysis',
      href: '/analysis'
    },
    {
      type: 'divider' as const
    },
    {
      type: 'section' as const,
      text: 'Help',
      items: [
        {
          type: 'link' as const,
          text: 'Documentation',
          href: 'https://docs.aws.amazon.com/bedrock/latest/userguide/bda.html',
          external: true
        },
      ]
    }
  ];

  return (
    <SideNavigation
      activeHref={location.pathname}
      header={{ href: '/', text: 'Home' }}
      items={navItems}
      onFollow={(event) => {
        if (!event.detail.external) {
          event.preventDefault();
          navigate(event.detail.href);
        }
      }}
    />
  );
};

export default Navigation;
